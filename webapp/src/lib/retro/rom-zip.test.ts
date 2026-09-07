// Reading and writing zips, and patching a bundle (#143).
//
// It loads the deployed file as is - the very one player.html imports.
import { describe, it, expect } from 'vitest';
import {
  applyBundlePatch,
  applyBundlePatchToSet,
  isZip,
  readZip,
  writeZip,
} from '../../../public/games/retro/rom-patch.js';

const enc = (s: string) => new Uint8Array(Array.from(s, (c) => c.charCodeAt(0)));
const bytes = (...n: number[]) => new Uint8Array(n);

/** A simple IPS: overwrite data at offset. */
function ips(offset: number, data: number[]): Uint8Array {
  return new Uint8Array([
    ...enc('PATCH'),
    (offset >> 16) & 0xff, (offset >> 8) & 0xff, offset & 0xff,
    (data.length >> 8) & 0xff, data.length & 0xff, ...data,
    ...enc('EOF'),
  ]);
}

describe('retro/zip', () => {
  describe('isZip', () => {
    it('매직으로 알아본다', () => {
      expect(isZip(bytes(0x50, 0x4b, 0x03, 0x04, 1, 2))).toBe(true);
      expect(isZip(enc('PATCH'))).toBe(false);
      expect(isZip(bytes(0x37, 0x7a, 0xbc, 0xaf))).toBe(false); // 7z
      expect(isZip(new Uint8Array(0))).toBe(false);
    });
  });

  describe('writeZip → readZip 왕복', () => {
    it('항목과 내용이 그대로 돌아온다', async () => {
      const entries = [
        { name: 'dd2_06g', data: bytes(1, 2, 3, 4, 5) },
        { name: 'dd2_13m', data: new Uint8Array(1000).fill(7) },
      ];
      const back = await readZip(writeZip(entries));

      expect(back.map((e) => e.name)).toEqual(['dd2_06g', 'dd2_13m']);
      expect(Array.from(back[0].data)).toEqual([1, 2, 3, 4, 5]);
      expect(back[1].data.length).toBe(1000);
      expect(back[1].data[999]).toBe(7);
    });

    it('빈 파일도 다룬다', async () => {
      const back = await readZip(writeZip([{ name: 'empty', data: new Uint8Array(0) }]));
      expect(back).toHaveLength(1);
      expect(back[0].data.length).toBe(0);
    });

    it('디렉터리 항목은 읽을 때 걸러진다', async () => {
      const back = await readZip(writeZip([
        { name: 'ddsoma/', data: new Uint8Array(0) },
        { name: 'ddsoma/a.ips', data: bytes(9) },
      ]));
      expect(back.map((e) => e.name)).toEqual(['ddsoma/a.ips']);
    });

    it('zip 이 아니면 오류', async () => {
      await expect(readZip(enc('not a zip at all'))).rejects.toThrow();
    });
  });

  describe('deflate 로 압축된 zip 도 읽는다', () => {
    it('실제 롬 zip 은 전부 deflate 다 — 못 읽으면 아무것도 안 된다', async () => {
      // Deflate through the standard API, then hand-build a zip containing it.
      const raw = new Uint8Array(500).map((_, i) => i & 0xff);
      const cs = new CompressionStream('deflate-raw');
      const w = cs.writable.getWriter();
      void w.write(raw);
      void w.close();
      const deflated = new Uint8Array(await new Response(cs.readable).arrayBuffer());

      const zip = writeZip([{ name: 'chip', data: raw }], { deflated: { chip: deflated } });
      const back = await readZip(zip);
      expect(back[0].name).toBe('chip');
      expect(Array.from(back[0].data.slice(0, 8))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(back[0].data.length).toBe(500);
    });
  });

  describe('applyBundlePatch', () => {
    const rom = () =>
      writeZip([
        { name: 'dd2_06g', data: new Uint8Array(16).fill(0) },
        { name: 'dd2_13m', data: new Uint8Array(16).fill(0) },
        { name: 'dd2_99z', data: new Uint8Array(16).fill(0xee) }, // 패치 없는 칩
      ]);

    const patch = () =>
      writeZip([
        { name: 'ddsoma/dd2_06g.ips', data: ips(0, [0xaa, 0xbb]) },
        { name: 'ddsoma/dd2_13m.ips', data: ips(4, [0xcc]) },
        { name: 'ddsoma/Korean_Translation.png', data: bytes(1, 2, 3) }, // ips 아님 — 무시
      ]);

    it('이름이 짝인 칩만 패치하고 나머지는 그대로 둔다', async () => {
      const out = await applyBundlePatch(rom(), patch());
      const entries = await readZip(out.rom);
      const byName = Object.fromEntries(entries.map((e) => [e.name, e.data]));

      expect(byName['dd2_06g'][0]).toBe(0xaa);
      expect(byName['dd2_06g'][1]).toBe(0xbb);
      expect(byName['dd2_13m'][4]).toBe(0xcc);
      // A chip with no patch is left alone.
      expect(Array.from(byName['dd2_99z'])).toEqual(Array(16).fill(0xee));
      expect(out.applied).toBe(2);
      expect(out.total).toBe(2);
    });

    it('디렉터리 접두사를 무시하고 짝을 찾는다', async () => {
      // Even when the name inside the patch is `ddsoma/dd2_06g.ips`, it must match the ROM's `dd2_06g`.
      const out = await applyBundlePatch(rom(), patch());
      expect(out.applied).toBeGreaterThan(0);
    });

    it('대소문자를 가리지 않는다', async () => {
      const r = writeZip([{ name: 'DD2_06G', data: new Uint8Array(4) }]);
      const p = writeZip([{ name: 'dd2_06g.ips', data: ips(0, [0x11]) }]);
      const out = await applyBundlePatch(r, p);
      expect(out.applied).toBe(1);
    });

    // The heart of #143 - a mismatched ROM set must not quietly load the original.
    it('하나도 못 맞추면 **양쪽 이름을 담아** 오류를 낸다', async () => {
      const mameStyle = writeZip([
        { name: 'dd2.05g', data: new Uint8Array(4) },
        { name: 'dd2a.03g', data: new Uint8Array(4) },
      ]);
      await expect(applyBundlePatch(mameStyle, patch())).rejects.toThrow(/dd2\.05g[\s\S]*dd2_06g|dd2_06g[\s\S]*dd2\.05g/);
    });

    it('오류 메시지에 몇 개 중 몇 개가 맞았는지 적는다', async () => {
      const mameStyle = writeZip([{ name: 'dd2.05g', data: new Uint8Array(4) }]);
      await expect(applyBundlePatch(mameStyle, patch())).rejects.toThrow(/2/);
    });

    it('패치 zip 에 ips 가 하나도 없으면 오류', async () => {
      const noIps = writeZip([{ name: 'readme.txt', data: bytes(1) }]);
      await expect(applyBundlePatch(rom(), noIps)).rejects.toThrow(/IPS/);
    });
  });

  // #151 - MAME/FBNeo calls **the same chip** `dd2.13m` while the patch uses the FBA spelling `dd2_13m`.
  // Only the separator differs, and failing to pair them meant the translation patch applied to nothing (0 of 13).
  //
  // **The names are not changed.** FBNeo finds a ROM in the patched archive by name, and that spelling
  // is the dotted one (`dd2.13m`). Renaming to the patch's spelling makes it unfindable instead.
  describe('구분자만 다른 이름 잇기', () => {
    const dotRom = () =>
      writeZip([
        { name: 'dd2.13m', data: new Uint8Array(16).fill(0) },
        { name: 'dd2a.03g', data: new Uint8Array(16).fill(0) },
      ]);
    const usPatch = () =>
      writeZip([
        { name: 'x/dd2_13m.ips', data: ips(0, [0xaa]) },
        { name: 'x/dd2a_03g.ips', data: ips(2, [0xbb]) },
      ]);

    it('점↔밑줄을 이어 준다 — 같은 칩의 다른 표기다', async () => {
      const out = await applyBundlePatch(dotRom(), usPatch());
      expect(out.applied).toBe(2);
      expect(out.loose).toBe(2);
      const byName = Object.fromEntries((await readZip(out.rom)).map((e) => [e.name, e.data]));
      expect(byName['dd2.13m'][0]).toBe(0xaa);
      expect(byName['dd2a.03g'][2]).toBe(0xbb);
    });

    it('**이름은 롬셋 것을 지킨다** — 코어가 그 이름으로 찾는다', async () => {
      const out = await applyBundlePatch(dotRom(), usPatch());
      const names = (await readZip(out.rom)).map((e) => e.name).sort();
      expect(names).toEqual(['dd2.13m', 'dd2a.03g']);
    });

    it('이름이 그대로 맞으면 그쪽이 이긴다 — 느슨한 짝은 뒷순위', async () => {
      const both = writeZip([
        { name: 'dd2_13m', data: new Uint8Array(16).fill(0) },
        { name: 'dd2.13m', data: new Uint8Array(16).fill(0xee) },
      ]);
      const out = await applyBundlePatch(both, writeZip([{ name: 'dd2_13m.ips', data: ips(0, [0xaa]) }]));
      const byName = Object.fromEntries((await readZip(out.rom)).map((e) => [e.name, e.data]));
      expect(byName['dd2_13m'][0]).toBe(0xaa);
      expect(byName['dd2.13m'][0]).toBe(0xee); // left untouched
      expect(out.loose).toBe(0);
    });

    it('둘 이상이 걸리면 **아무것도 건드리지 않는다** — 엉뚱한 칩을 고치면 조용히 망가진다', async () => {
      const ambiguous = writeZip([
        { name: 'dd2.13m', data: new Uint8Array(16).fill(0x11) },
        { name: 'dd2-13m', data: new Uint8Array(16).fill(0x22) },
      ]);
      await expect(
        applyBundlePatch(ambiguous, writeZip([{ name: 'dd2_13m.ips', data: ips(0, [0xaa]) }])),
      ).rejects.toThrow();
    });

    // An arcade chip's size is fixed by the hardware - if it grows, it is a different ROM.
    it('칩 크기를 넘기는 패치는 잇지 않는다', async () => {
      const small = writeZip([{ name: 'dd2.13m', data: new Uint8Array(4) }]);
      await expect(
        applyBundlePatch(small, writeZip([{ name: 'dd2_13m.ips', data: ips(100, [0xaa]) }])),
      ).rejects.toThrow();
    });
  });

  // #148 - split sets are **not merged**. FBA looks for the parent archive separately, so each is left as it is and
  // only the patch is applied across archives.
  describe('applyBundlePatchToSet — 아카이브를 가로지르는 묶음 패치', () => {
    const parent = () =>
      writeZip([
        { name: 'dd2_13m', data: new Uint8Array(8).fill(0x10) },
        { name: 'dd2_14m', data: new Uint8Array(8).fill(0x11) },
      ]);
    const clone = () =>
      writeZip([
        { name: 'dd2a_03g', data: new Uint8Array(8).fill(0x20) },
        { name: 'dd2a_04g', data: new Uint8Array(8).fill(0x21) },
      ]);
    const bundle = () =>
      writeZip([
        { name: 'x/dd2_13m.ips', data: ips(0, [0xaa]) },   // 부모 쪽 칩
        { name: 'x/dd2a_03g.ips', data: ips(0, [0xbb]) },  // 클론 쪽 칩
        { name: 'x/readme.txt', data: bytes(1) },
      ]);

    it('칩이 어느 아카이브에 있든 제자리에 먹인다', async () => {
      const out = await applyBundlePatchToSet([parent(), clone()], bundle());
      expect(out.applied).toBe(2);

      const p = Object.fromEntries((await readZip(out.roms[0])).map((e) => [e.name, e.data]));
      const c = Object.fromEntries((await readZip(out.roms[1])).map((e) => [e.name, e.data]));
      expect(p['dd2_13m'][0]).toBe(0xaa);
      expect(c['dd2a_03g'][0]).toBe(0xbb);
      // An unpaired chip is left alone.
      expect(p['dd2_14m'][0]).toBe(0x11);
      expect(c['dd2a_04g'][0]).toBe(0x21);
    });

    it('넘긴 순서를 그대로 돌려준다 — 호출측이 이름과 짝지어야 한다', async () => {
      const out = await applyBundlePatchToSet([parent(), clone()], bundle());
      expect(out.roms).toHaveLength(2);
      expect((await readZip(out.roms[0])).map((e) => e.name)).toContain('dd2_13m');
      expect((await readZip(out.roms[1])).map((e) => e.name)).toContain('dd2a_03g');
    });

    it('한 아카이브만 맞아도 통과한다 — 부분 적용이 정상이다', async () => {
      const only = writeZip([{ name: 'x/dd2_13m.ips', data: ips(0, [0xaa]) }]);
      const out = await applyBundlePatchToSet([parent(), clone()], only);
      expect(out.applied).toBe(1);
    });

    // Names differing only by separator are bridged in #151, so this checks with **an entirely different ROM set**.
    it('전체에서 하나도 못 맞추면 **양쪽 이름을 담아** 오류', async () => {
      const other = writeZip([{ name: 'ssf2t.03', data: new Uint8Array(4) }]);
      await expect(applyBundlePatchToSet([other], bundle())).rejects.toThrow(
        /ssf2t\.03[\s\S]*dd2_13m|dd2_13m[\s\S]*ssf2t\.03/,
      );
    });

    it('패치 zip 에 ips 가 하나도 없으면 오류', async () => {
      const noIps = writeZip([{ name: 'readme.txt', data: bytes(1) }]);
      await expect(applyBundlePatchToSet([parent()], noIps)).rejects.toThrow(/IPS/);
    });
  });
});

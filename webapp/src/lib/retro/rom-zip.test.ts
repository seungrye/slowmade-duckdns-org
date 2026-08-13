// zip 읽기·쓰기와 묶음 패치 (#143).
//
// 배포되는 파일을 그대로 불러 검증한다 — player.html 이 import 하는 것과 같은 하나다.
import { describe, it, expect } from 'vitest';
import {
  applyBundlePatch,
  isZip,
  mergeZips,
  readZip,
  writeZip,
} from '../../../public/games/retro/rom-patch.js';

const enc = (s: string) => new Uint8Array(Array.from(s, (c) => c.charCodeAt(0)));
const bytes = (...n: number[]) => new Uint8Array(n);

/** 간단한 IPS: offset 에 data 를 덮어쓴다. */
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
      // 표준 API 로 deflate 한 뒤, 그걸 담은 zip 을 손으로 만든다.
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
      // 패치가 없던 칩은 손대지 않는다.
      expect(Array.from(byName['dd2_99z'])).toEqual(Array(16).fill(0xee));
      expect(out.applied).toBe(2);
      expect(out.total).toBe(2);
    });

    it('디렉터리 접두사를 무시하고 짝을 찾는다', async () => {
      // 패치 안 이름이 `ddsoma/dd2_06g.ips` 라도 롬의 `dd2_06g` 와 맞아야 한다.
      const out = await applyBundlePatch(rom(), patch());
      expect(out.applied).toBeGreaterThan(0);
    });

    it('대소문자를 가리지 않는다', async () => {
      const r = writeZip([{ name: 'DD2_06G', data: new Uint8Array(4) }]);
      const p = writeZip([{ name: 'dd2_06g.ips', data: ips(0, [0x11]) }]);
      const out = await applyBundlePatch(r, p);
      expect(out.applied).toBe(1);
    });

    // #143 의 핵심 — 롬셋이 다르면 조용히 원본을 띄우지 않는다.
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

  // #143 — 분할 셋은 **미리 합쳐서** 다룬다. 그러면 코어에 완전한 셋 하나만 주면 되고
  // 패치도 한 번에 먹는다.
  describe('mergeZips — 부모 + 클론', () => {
    const parent = () =>
      writeZip([
        { name: 'dd2_13m', data: new Uint8Array(8).fill(0x10) },
        { name: 'dd2_06g', data: new Uint8Array(8).fill(0x99) }, // 클론이 덮어쓸 것
      ]);
    const clone = () =>
      writeZip([
        { name: 'dd2a_03g', data: new Uint8Array(8).fill(0x20) },
        { name: 'dd2_06g', data: new Uint8Array(8).fill(0x30) }, // 리전별 교체본
      ]);

    it('둘의 파일이 모두 들어간다', async () => {
      const back = await readZip(await mergeZips([parent(), clone()]));
      expect(back.map((e) => e.name).sort()).toEqual(['dd2_06g', 'dd2_13m', 'dd2a_03g']);
    });

    it('**클론이 부모를 덮어쓴다** — 분할 셋의 규칙이다', async () => {
      const back = await readZip(await mergeZips([parent(), clone()]));
      const byName = Object.fromEntries(back.map((e) => [e.name, e.data]));
      expect(byName['dd2_06g'][0]).toBe(0x30); // 부모의 0x99 가 아니라 클론의 0x30
      expect(byName['dd2_13m'][0]).toBe(0x10); // 부모에만 있는 것은 그대로
    });

    it('순서를 뒤집으면 부모가 이긴다 — 넘기는 순서가 규칙이다', async () => {
      const back = await readZip(await mergeZips([clone(), parent()]));
      const byName = Object.fromEntries(back.map((e) => [e.name, e.data]));
      expect(byName['dd2_06g'][0]).toBe(0x99);
    });

    it('경로가 붙어 있어도 파일명만 남긴다', async () => {
      const nested = writeZip([{ name: 'ddsoma/dd2_99z', data: new Uint8Array(4) }]);
      const back = await readZip(await mergeZips([nested]));
      expect(back[0].name).toBe('dd2_99z');
    });

    it('하나만 줘도 된다 — 완전 셋이면 합칠 게 없다', async () => {
      const back = await readZip(await mergeZips([clone(), undefined]));
      expect(back).toHaveLength(2);
    });

    it('합친 뒤에는 패치가 한 번에 먹는다', async () => {
      const bundle = writeZip([
        { name: 'x/dd2a_03g.ips', data: ips(0, [0x11]) },
        { name: 'x/dd2_13m.ips', data: ips(0, [0x22]) },
      ]);
      const out = await applyBundlePatch(await mergeZips([parent(), clone()]), bundle);
      expect(out.applied).toBe(2);

      const byName = Object.fromEntries((await readZip(out.rom)).map((e) => [e.name, e.data]));
      expect(byName['dd2a_03g'][0]).toBe(0x11);
      expect(byName['dd2_13m'][0]).toBe(0x22);
    });
  });
});

// Phoenix(복호화) 세트에 필요한 phoenix.key 를 채워 넣는다 (#153).
//
// 배포되는 파일을 그대로 불러 검증한다 — player.js 가 import 하는 것과 같은 하나다.
import { describe, it, expect } from 'vitest';
import {
  PHOENIX_KEY_NAME,
  ensurePhoenixKey,
  phoenixKeyBytes,
  zipEntryNames,
} from '../../../public/games/retro/rom-patch.js';
import { crc32, readZip, writeZip } from '../../../public/games/retro/rom-patch.js';

describe('phoenixKeyBytes', () => {
  // FBNeo 가 요구하는 값. CRC 로 못을 박아 둔다 — 틀리면 롬셋이 안 뜬다.
  it('20바이트 0xFF 이고 CRC 가 0x2cf772b0 이다', () => {
    const k = phoenixKeyBytes();
    expect(k.length).toBe(20);
    expect([...new Set(k)]).toEqual([0xff]);
    expect(crc32(k)).toBe(0x2cf772b0);
  });

  it('호출할 때마다 새 배열이다 — 호출측이 고쳐도 서로 안 물린다', () => {
    const a = phoenixKeyBytes();
    a[0] = 0;
    expect(phoenixKeyBytes()[0]).toBe(0xff);
  });
});

describe('zipEntryNames', () => {
  it('압축을 풀지 않고 이름만 읽는다', async () => {
    const zip = writeZip([
      { name: 'dd2.13m', data: new Uint8Array(8) },
      { name: 'ddsom.key', data: new Uint8Array(20) },
    ]);
    expect(await zipEntryNames(zip)).toEqual(['dd2.13m', 'ddsom.key']);
  });

  it('zip 이 아니면 빈 목록 — 판단만 막고 실행은 막지 않는다', async () => {
    expect(await zipEntryNames(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
});

describe('ensurePhoenixKey', () => {
  const rom = () =>
    writeZip([
      { name: 'dd2ud.03g', data: new Uint8Array(16).fill(1) },
      { name: 'dd2.13m', data: new Uint8Array(16).fill(2) },
    ]);

  it('키가 없으면 넣어 준다', async () => {
    const out = await ensurePhoenixKey(rom());
    expect(out.added).toBe(true);

    const entries = await readZip(out.zip);
    const key = entries.find((e: { name: string }) => e.name === PHOENIX_KEY_NAME);
    expect(key).toBeTruthy();
    expect(crc32(key!.data)).toBe(0x2cf772b0);
  });

  it('원래 있던 항목은 내용 그대로 남는다', async () => {
    const out = await ensurePhoenixKey(rom());
    const byName = Object.fromEntries((await readZip(out.zip)).map((e) => [e.name, e.data]));
    expect(Array.from(byName['dd2ud.03g'])).toEqual(Array(16).fill(1));
    expect(Array.from(byName['dd2.13m'])).toEqual(Array(16).fill(2));
  });

  // 암호화 세트는 `ddsoma.key` 처럼 **제 이름의** 키를 요구한다. 아무 키나 있으면 손대지 않는다.
  it('이미 .key 가 있으면 건드리지 않는다', async () => {
    const withKey = writeZip([
      { name: 'dd2a.03g', data: new Uint8Array(8) },
      { name: 'ddsoma.key', data: new Uint8Array(20).fill(7) },
    ]);
    const out = await ensurePhoenixKey(withKey);
    expect(out.added).toBe(false);
    expect(out.zip).toBe(withKey); // 같은 배열을 그대로 돌려준다 — 복사조차 안 한다
  });

  it('zip 이 아니면 그대로 돌려준다', async () => {
    const notZip = new Uint8Array([1, 2, 3, 4]);
    const out = await ensurePhoenixKey(notZip);
    expect(out.added).toBe(false);
    expect(out.zip).toBe(notZip);
  });

  // 실제 롬 zip 은 전부 deflate 다. 다시 묶으면 수십 MB 가 무압축으로 부풀므로 **덧붙인다**.
  it('원본의 압축을 유지한다 — 다시 묶지 않는다', async () => {
    const raw = new Uint8Array(4096).map((_, i) => i & 0xff);
    const cs = new CompressionStream('deflate-raw');
    const w = cs.writable.getWriter();
    void w.write(raw);
    void w.close();
    const deflated = new Uint8Array(await new Response(cs.readable).arrayBuffer());

    const packed = writeZip([{ name: 'chip', data: raw }], { deflated: { chip: deflated } });
    const out = await ensurePhoenixKey(packed);

    expect(out.added).toBe(true);
    // 덧붙였으니 원본보다 딱 키 하나만큼만 커진다(무압축으로 부풀지 않는다).
    expect(out.zip.length).toBeLessThan(packed.length + 300);
    const entries = await readZip(out.zip);
    expect(entries.find((e: { name: string }) => e.name === 'chip')!.data.length).toBe(4096);
  });
});

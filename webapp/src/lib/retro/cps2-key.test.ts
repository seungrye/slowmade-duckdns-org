// Filling in the phoenix.key that Phoenix (decrypted) sets require (#153).
//
// It loads the deployed file as is - the very one player.js imports.
import { describe, it, expect } from 'vitest';
import {
  PHOENIX_KEY_NAME,
  ensurePhoenixKey,
  phoenixKeyBytes,
  zipEntryNames,
} from '../../../public/games/retro/rom-patch.js';
import { crc32, readZip, writeZip } from '../../../public/games/retro/rom-patch.js';

describe('phoenixKeyBytes', () => {
  // The value FBNeo requires. Pinned by CRC - wrong, and the ROM set does not start.
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

  // An encrypted set requires a key of **its own name**, like `ddsoma.key`. With any key already present it is left alone.
  it('이미 .key 가 있으면 건드리지 않는다', async () => {
    const withKey = writeZip([
      { name: 'dd2a.03g', data: new Uint8Array(8) },
      { name: 'ddsoma.key', data: new Uint8Array(20).fill(7) },
    ]);
    const out = await ensurePhoenixKey(withKey);
    expect(out.added).toBe(false);
    expect(out.zip).toBe(withKey); // the very same array is returned - not even copied
  });

  it('zip 이 아니면 그대로 돌려준다', async () => {
    const notZip = new Uint8Array([1, 2, 3, 4]);
    const out = await ensurePhoenixKey(notZip);
    expect(out.added).toBe(false);
    expect(out.zip).toBe(notZip);
  });

  // Real ROM zips are all deflate. Repacking would inflate tens of MB uncompressed, so it **appends** instead.
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
    // Appending grows it by exactly one key over the original (with no uncompressed bloat).
    expect(out.zip.length).toBeLessThan(packed.length + 300);
    const entries = await readZip(out.zip);
    expect(entries.find((e: { name: string }) => e.name === 'chip')!.data.length).toBe(4096);
  });
});

// /api/games/retro/roms/[id]/download — 롬 내려받기 (#194).
//
// 이름 짓기는 `download-bundle.test.ts` 가 본다. 여기서는 인가·묶을지 말지·실제로 열리는
// zip 인지를 본다. **되읽기 검증**이 핵심이다 — 우리가 쓴 zip 을 같은 파일의 `readZip` 으로
// 다시 풀어 항목 이름과 바이트가 그대로인지 확인한다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  objects: new Map<string, Uint8Array>(),
  rom: null as Record<string, unknown> | null,
}));

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('minio', () => ({
  Client: class {
    async getObject(_b: string, key: string) {
      const data = h.objects.get(key);
      if (!data) throw new Error(`no such key: ${key}`);
      const { Readable } = await import('node:stream');
      return Readable.from([Buffer.from(data)]);
    }
  },
}));
vi.mock('@/models/retro-rom', () => ({
  default: { findOne: () => ({ select: () => ({ lean: async () => h.rom }) }) },
}));

import { GET } from './route';
import { auth } from '@/auth';
import { readZip } from '../../../../../../../../public/games/retro/rom-patch.js';

const bytes = (n: number, fill: number) => new Uint8Array(n).fill(fill);
const params = Promise.resolve({ id: '653f1a2b3c4d5e6f70819202' });
const req = () => new Request('http://localhost/api/games/retro/roms/x/download');

describe('GET /api/games/retro/roms/[id]/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { email: 'me@test' } } as never);
    h.objects.clear();
    h.objects.set('roms/game', bytes(16, 1));
    h.rom = {
      title: '테일즈 오브 판타지아',
      filename: 'game.sfc',
      objectKey: 'roms/game',
      size: 16,
      patches: [],
      parentSets: [],
    };
  });

  it('로그인하지 않으면 404 — 401 은 "그 id 는 있다" 는 정보가 된다', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect((await GET(req(), { params })).status).toBe(404);
  });

  it('내 롬이 아니면 404', async () => {
    h.rom = null;
    expect((await GET(req(), { params })).status).toBe(404);
  });

  it('묶을 것이 없으면 zip 이 아니라 원본을 준다', async () => {
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    const cd = res.headers.get('Content-Disposition') ?? '';
    expect(cd).toContain('attachment');
    expect(decodeURIComponent(cd)).toContain('game.sfc');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes(16, 1));
  });

  it('패치가 있으면 zip 으로 묶고, 되읽으면 둘 다 들어 있다', async () => {
    h.objects.set('patches/kor', bytes(8, 2));
    h.rom!.patches = [{ _id: 'p1', name: '한글.ips', format: 'ips', size: 8, objectKey: 'patches/kor' }];

    const res = await GET(req(), { params });
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(decodeURIComponent(res.headers.get('Content-Disposition') ?? '')).toContain('테일즈');

    const entries = await readZip(new Uint8Array(await res.arrayBuffer()));
    expect(entries.map((e: { name: string }) => e.name)).toEqual(['game.sfc', '한글.ips']);
    expect(entries[0].data).toEqual(bytes(16, 1));
    expect(entries[1].data).toEqual(bytes(8, 2));
  });

  it('부모셋도 함께 묶는다 — 아케이드는 이게 없으면 실행이 안 된다', async () => {
    h.objects.set('roms/parent', bytes(4, 3));
    h.rom!.parentSets = [{ name: 'ddsom.zip', size: 4, objectKey: 'roms/parent' }];

    const entries = await readZip(new Uint8Array(await (await GET(req(), { params })).arrayBuffer()));
    expect(entries.map((e: { name: string }) => e.name)).toEqual(['game.sfc', 'ddsom.zip']);
  });

  it('롬과 부모셋 이름이 같아도 둘 다 살아남는다', async () => {
    h.objects.set('roms/parent', bytes(4, 3));
    h.rom!.filename = 'ddsoma.zip';
    h.rom!.parentSets = [{ name: 'ddsoma.zip', size: 4, objectKey: 'roms/parent' }];

    const entries = await readZip(new Uint8Array(await (await GET(req(), { params })).arrayBuffer()));
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((e: { name: string }) => e.name)).size).toBe(2);
    // 바이트가 서로 다른 파일이라는 것까지 확인 — 덮어썼다면 같아진다.
    expect(entries[0].data).not.toEqual(entries[1].data);
  });

  it('패치가 꺼져 있으면 넣지 않는다 — 화면에서 끈 것을 존중한다', async () => {
    h.objects.set('patches/kor', bytes(8, 2));
    h.rom!.patches = [{ _id: 'p1', name: '한글.ips', format: 'ips', size: 8, objectKey: 'patches/kor' }];
    h.rom!.patchEnabled = false;

    const res = await GET(req(), { params });
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
  });

  it('너무 크면 413 과 이유 — 조용히 메모리를 먹다 죽지 않는다', async () => {
    h.objects.set('patches/kor', bytes(8, 2));
    h.rom!.size = 300 * 1024 * 1024;
    h.rom!.patches = [{ _id: 'p1', name: 'x.ips', format: 'ips', size: 8, objectKey: 'patches/kor' }];

    const res = await GET(req(), { params });
    expect(res.status).toBe(413);
    expect((await res.json()).message).toContain('큽니다');
  });

  it('개인 파일이라 캐시에 남기지 않는다', async () => {
    expect((await GET(req(), { params })).headers.get('Cache-Control')).toContain('no-store');
  });
});

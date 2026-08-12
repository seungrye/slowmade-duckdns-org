import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

const mockGetObject = vi.hoisted(() => vi.fn());
const mockFindOne = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.MINIO_ENDPOINT = 'test-endpoint.com';
  process.env.MINIO_ACCESSKEY = 'test-key';
  process.env.MINIO_SECRETKEY = 'test-secret';
  process.env.MINIO_BUCKET = 'test-bucket';
});

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock('minio', () => ({ Client: class { getObject = mockGetObject; } }));
vi.mock('@/models/retro-rom', () => ({ default: { findOne: mockFindOne } }));

import { GET } from './route';
import { auth } from '@/auth';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const ROM_ID = '653f1a2b3c4d5e6f70819202';
const PATCH_ID = '653f1a2b3c4d5e6f70819999';

function ctx(id: string, patchId: string) {
  return { params: Promise.resolve({ id, patchId }) };
}

function findOneReturns(doc: unknown) {
  mockFindOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(doc) }) });
}

const PATCH = { _id: PATCH_ID, name: 'ko.ips', format: 'ips', size: 3, objectKey: 'retro-patches/x.ips' };

describe('GET /api/games/retro/roms/[id]/patches/[patchId]/file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { email: 'me@test.com' } });
    findOneReturns({ patches: [PATCH] });
    mockGetObject.mockResolvedValue(Readable.from([Buffer.from([1, 2, 3])]));
  });

  it('로그인하지 않으면 404', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET(new Request('http://x'), ctx(ROM_ID, PATCH_ID))).status).toBe(404);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('내 롬만 찾는다', async () => {
    await GET(new Request('http://x'), ctx(ROM_ID, PATCH_ID));
    expect(mockFindOne).toHaveBeenCalledWith({
      _id: ROM_ID,
      userEmail: 'me@test.com',
      isDeleted: { $ne: true },
    });
  });

  it('파일을 흘려보내고 공유 캐시를 막는다', async () => {
    const res = await GET(new Request('http://x'), ctx(ROM_ID, PATCH_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('private');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('지운 패치는 404 — 배열에는 남아 있지만 내려주지 않는다', async () => {
    findOneReturns({ patches: [{ ...PATCH, isDeleted: true }] });
    expect((await GET(new Request('http://x'), ctx(ROM_ID, PATCH_ID))).status).toBe(404);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('그 롬에 없는 패치 id 는 404', async () => {
    findOneReturns({ patches: [{ ...PATCH, _id: '653f1a2b3c4d5e6f70810000' }] });
    expect((await GET(new Request('http://x'), ctx(ROM_ID, PATCH_ID))).status).toBe(404);
  });

  it('MinIO 가 실패해도 404 로 조용히 닫는다', async () => {
    mockGetObject.mockRejectedValue(new Error('gone'));
    expect((await GET(new Request('http://x'), ctx(ROM_ID, PATCH_ID))).status).toBe(404);
  });
});

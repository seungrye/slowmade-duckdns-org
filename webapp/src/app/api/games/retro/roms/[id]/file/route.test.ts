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

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** findOne().select().lean() 체인 흉내. */
function findOneReturns(doc: unknown) {
  mockFindOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(doc) }) });
}

describe('GET /api/games/retro/roms/[id]/file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { email: 'me@test.com' } });
    findOneReturns({ objectKey: 'retro-roms/x.nes', filename: 'x.nes', size: 3 });
    mockGetObject.mockResolvedValue(Readable.from([Buffer.from([1, 2, 3])]));
  });

  it('로그인하지 않으면 404 — 401 은 그 id 가 있다는 힌트가 된다', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET(new Request('http://x'), ctx(ROM_ID))).status).toBe(404);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('내 롬만 찾는다', async () => {
    await GET(new Request('http://x'), ctx(ROM_ID));
    expect(mockFindOne).toHaveBeenCalledWith({
      _id: ROM_ID,
      userEmail: 'me@test.com',
      isDeleted: { $ne: true },
    });
  });

  it('남의 롬(또는 없는 롬)은 404 이고 MinIO 를 건드리지 않는다', async () => {
    findOneReturns(null);
    expect((await GET(new Request('http://x'), ctx(ROM_ID))).status).toBe(404);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('파일 내용을 흘려보내고 공유 캐시를 막는다', async () => {
    const res = await GET(new Request('http://x'), ctx(ROM_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('private');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('MinIO 가 실패해도 500 대신 404 로 조용히 닫는다', async () => {
    mockGetObject.mockRejectedValue(new Error('gone'));
    expect((await GET(new Request('http://x'), ctx(ROM_ID))).status).toBe(404);
  });

  it('ObjectId 형식이 아니면 DB 도 MinIO 도 건드리지 않고 404', async () => {
    expect((await GET(new Request('http://x'), ctx('not-an-id'))).status).toBe(404);
    expect(mockFindOne).not.toHaveBeenCalled();
    expect(mockGetObject).not.toHaveBeenCalled();
  });
});

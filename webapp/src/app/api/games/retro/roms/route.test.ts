import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockFind = vi.hoisted(() => vi.fn());

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/retro-rom', () => ({ default: { find: mockFind } }));

import { GET } from './route';
import { auth } from '@/auth';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

/** find().sort().lean() 체인 흉내. */
function findReturns(docs: unknown[]) {
  mockFind.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve(docs) }) });
}

describe('GET /api/games/retro/roms — 내 롬 목록', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { email: 'me@test.com' } });
    findReturns([]);
  });

  it('로그인하지 않으면 401', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('내 것만, 안 지운 것만 찾는다', async () => {
    await GET();
    expect(mockFind).toHaveBeenCalledWith({ userEmail: 'me@test.com', isDeleted: { $ne: true } });
  });

  it('오브젝트 키를 흘리지 않는다 — 키가 새면 인증 프록시를 우회할 실마리가 된다', async () => {
    findReturns([
      {
        _id: 'abc',
        title: '내 롬',
        platform: 'gba',
        size: 4096,
        objectKey: 'retro-roms/secret-key.gba',
        createdAt: new Date(0),
      },
    ]);
    const body = await (await GET()).json();
    expect(body.data[0]).toEqual({
      id: 'abc',
      title: '내 롬',
      platform: 'gba',
      size: 4096,
      createdAt: '1970-01-01T00:00:00.000Z',
      // #116 — 카드가 쓰는 값들. 목록 API 는 세이브 유무를 모르므로 false.
      patchEnabled: true,
      hasSave: false,
    });
    expect(JSON.stringify(body)).not.toContain('secret-key');
  });
});

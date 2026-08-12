import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockUpdateOne = vi.hoisted(() => vi.fn());

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/models/retro-rom', () => ({ default: { updateOne: mockUpdateOne } }));

import { DELETE } from './route';
import { auth } from '@/auth';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const ROM_ID = '653f1a2b3c4d5e6f70819202';

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('DELETE /api/games/retro/roms/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { email: 'me@test.com' } });
    mockUpdateOne.mockResolvedValue({ matchedCount: 1 });
  });

  it('로그인하지 않으면 401', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await DELETE(new Request('http://x'), ctx(ROM_ID))).status).toBe(401);
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  it('진짜 지우지 않고 isDeleted 플래그만 세운다', async () => {
    const res = await DELETE(new Request('http://x'), ctx(ROM_ID));
    expect(res.status).toBe(200);
    const [filter, update] = mockUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: ROM_ID, userEmail: 'me@test.com', isDeleted: { $ne: true } });
    expect(update).toEqual({ $set: { isDeleted: true } });
  });

  it('남의 롬은 조건에서 걸러져 404 — 있는지 없는지도 알려 주지 않는다', async () => {
    mockUpdateOne.mockResolvedValue({ matchedCount: 0 });
    expect((await DELETE(new Request('http://x'), ctx(ROM_ID))).status).toBe(404);
  });

  it('ObjectId 형식이 아니면 DB 를 건드리지 않고 404 — CastError 로 500 이 나면 안 된다', async () => {
    expect((await DELETE(new Request('http://x'), ctx('not-an-id'))).status).toBe(404);
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });
});

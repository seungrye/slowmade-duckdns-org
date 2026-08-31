import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/achievements', () => ({ achievementView: vi.fn() }));

import { GET } from './route';
import { auth } from '@/auth';
import { achievementView } from '@/lib/achievements';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockView = achievementView as ReturnType<typeof vi.fn>;

const signedIn = () => mockAuth.mockResolvedValue({ user: { email: 'me@test.com' }, expires: '' });

beforeEach(() => vi.clearAllMocks());

describe('GET /api/my-achievements', () => {
  it('인증되지 않으면 401', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it('달성한 것과 도전 중인 것을 함께 내려준다', async () => {
    signedIn();
    mockView.mockResolvedValue({
      unlocked: [{ key: 'FIRST_POST', name: '첫 글 작성', tier: 'bronze' }],
      locked: [{ key: 'POST_COUNT_250', current: 174, target: 250, hidden: false }],
    });

    const res = await GET();
    const { data } = await res.json();

    expect(res.status).toBe(200);
    expect(mockView).toHaveBeenCalledWith('me@test.com');
    expect(data.unlocked).toHaveLength(1);
    // 예전엔 달성한 것만 줬다. 잠긴 목록이 있어야 다음 목표가 보인다.
    expect(data.locked[0]).toMatchObject({ current: 174, target: 250 });
  });

  it('판정이 실패하면 500 — 조용히 빈 목록을 주면 업적이 사라진 것처럼 보인다', async () => {
    signedIn();
    mockView.mockRejectedValue(new Error('mongo down'));

    expect((await GET()).status).toBe(500);
  });
});

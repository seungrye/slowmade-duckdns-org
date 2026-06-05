// /api/web-adventure/past-runs — 회차 history (#239).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/models/web-adventure-past-run', () => ({
  default: { find: vi.fn() },
}));

import { GET } from './route';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import { auth } from '@/auth';

describe('GET /api/web-adventure/past-runs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('비로그인 → 401', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('로그인 → 자기 past_run 목록 (runIndex 내림차순)', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    const list = [
      { runIndex: 3, endingId: 'spirit' },
      { runIndex: 2, endingId: 'main' },
    ];
    (WebAdventurePastRun.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(list) }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(list);
    expect(WebAdventurePastRun.find).toHaveBeenCalledWith({ userEmail: 'a@b.com' });
  });
});

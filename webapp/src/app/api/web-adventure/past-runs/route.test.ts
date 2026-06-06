// /api/web-adventure/past-runs — 회차 history (#239 / #293 limit).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/models/web-adventure-past-run', () => ({
  default: { find: vi.fn() },
}));

import { GET } from './route';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import { auth } from '@/auth';

function makeReq(url: string) {
  return new Request(url) as unknown as Parameters<typeof GET>[0];
}

function mockChain(returnValue: unknown[]) {
  const leanMock = vi.fn().mockResolvedValue(returnValue);
  const limitMock = vi.fn().mockReturnValue({ lean: leanMock });
  const sortMock = vi.fn().mockReturnValue({ limit: limitMock });
  (WebAdventurePastRun.find as ReturnType<typeof vi.fn>).mockReturnValue({ sort: sortMock });
  return { sortMock, limitMock, leanMock };
}

describe('GET /api/web-adventure/past-runs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('비로그인 → 401', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(makeReq('http://x/api/web-adventure/past-runs'));
    expect(res.status).toBe(401);
  });

  it('로그인 → 자기 past_run 목록 (runIndex 내림차순)', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    const list = [
      { runIndex: 3, endingId: 'harmony' },
      { runIndex: 2, endingId: 'fall' },
    ];
    mockChain(list);
    const res = await GET(makeReq('http://x/api/web-adventure/past-runs'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(list);
    expect(WebAdventurePastRun.find).toHaveBeenCalledWith({ userEmail: 'a@b.com' });
  });

  // #293 페이지네이션.
  it('limit 미지정 → 기본 500', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    const { limitMock } = mockChain([]);
    await GET(makeReq('http://x/api/web-adventure/past-runs'));
    expect(limitMock).toHaveBeenCalledWith(500);
  });

  it('limit=100 → 100 적용', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    const { limitMock } = mockChain([]);
    await GET(makeReq('http://x/api/web-adventure/past-runs?limit=100'));
    expect(limitMock).toHaveBeenCalledWith(100);
  });

  it('limit=10000 → MAX_LIMIT 5000 으로 cap', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    const { limitMock } = mockChain([]);
    await GET(makeReq('http://x/api/web-adventure/past-runs?limit=10000'));
    expect(limitMock).toHaveBeenCalledWith(5000);
  });

  it('limit=abc → 기본 500 fallback', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    const { limitMock } = mockChain([]);
    await GET(makeReq('http://x/api/web-adventure/past-runs?limit=abc'));
    expect(limitMock).toHaveBeenCalledWith(500);
  });
});

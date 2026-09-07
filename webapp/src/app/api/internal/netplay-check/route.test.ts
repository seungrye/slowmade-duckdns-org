// /api/internal/netplay-check - the nginx auth_request gate (#186).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/require-auth', () => ({ requireAuth: vi.fn() }));

import { GET } from './route';
import { requireAuth } from '@/lib/require-auth';

describe('GET /api/internal/netplay-check', () => {
  beforeEach(() => vi.clearAllMocks());

  it('로그인했으면 200 — nginx 가 통과시킨다', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ email: 'someone@test' });
    expect((await GET()).status).toBe(200);
  });

  // nginx's auth_request treats only 401 and 403 as "authorisation failed". A 404 is treated as a 500 and breaks
  // the gate entirely.
  it('아니면 401 — 404 가 아니다', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(requireAuth).mockResolvedValue(NextResponse.json({ message: 'Not found' }, { status: 404 }));
    expect((await GET()).status).toBe(401);
  });

  it('본문을 싣지 않는다 — auth_request 는 상태 코드만 본다', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ email: 'someone@test' });
    expect(await (await GET()).text()).toBe('');
  });
});

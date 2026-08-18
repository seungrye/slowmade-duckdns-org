// /api/internal/owner-check — nginx auth_request 게이트 (#186).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/require-owner', () => ({ requireOwner: vi.fn() }));

import { GET } from './route';
import { requireOwner } from '@/lib/require-owner';

describe('GET /api/internal/owner-check', () => {
  beforeEach(() => vi.clearAllMocks());

  it('작성자면 200 — nginx 가 통과시킨다', async () => {
    vi.mocked(requireOwner).mockResolvedValue({ email: 'owner@test' });
    expect((await GET()).status).toBe(200);
  });

  // nginx auth_request 는 401/403 만 "인가 실패"로 다룬다. 404 를 주면 500 으로 취급해
  // 게이트가 통째로 깨진다.
  it('아니면 401 — 404 가 아니다', async () => {
    const { NextResponse } = await import('next/server');
    vi.mocked(requireOwner).mockResolvedValue(NextResponse.json({ message: 'Not found' }, { status: 404 }));
    expect((await GET()).status).toBe(401);
  });

  it('본문을 싣지 않는다 — auth_request 는 상태 코드만 본다', async () => {
    vi.mocked(requireOwner).mockResolvedValue({ email: 'owner@test' });
    expect(await (await GET()).text()).toBe('');
  });
});

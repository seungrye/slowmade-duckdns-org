import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { auth } from '@/auth';
import { requireAuth } from './require-auth';

// Auth.js v5의 auth는 오버로드 타입이므로 세션 반환 형태로 한정
const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('session이 null이면 401 NextResponse를 반환한다', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await requireAuth();
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it('session에 user.email이 없으면 401 NextResponse를 반환한다', async () => {
    mockAuth.mockResolvedValue({ user: {}, expires: '' } as never);
    const result = await requireAuth();
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it('유효한 session이면 email 객체를 반환한다', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'user@example.com' }, expires: '' } as never);
    const result = await requireAuth();
    expect(result).toEqual({ email: 'user@example.com' });
  });

  it('반환값이 NextResponse가 아니면 email을 구조분해할 수 있다', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'dev@test.com' }, expires: '' } as never);
    const result = await requireAuth();
    if (result instanceof NextResponse) throw new Error('unexpected NextResponse');
    expect(result.email).toBe('dev@test.com');
  });
});

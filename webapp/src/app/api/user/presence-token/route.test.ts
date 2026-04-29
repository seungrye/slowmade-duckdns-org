import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/models/user', () => ({
  default: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));
vi.mock('crypto', () => ({
  randomBytes: vi.fn(() => ({ toString: () => 'abc123deadbeef' })),
}));

import { GET, POST } from './route';
import User from '@/models/user';
import { auth } from '@/auth';

function makeRequest(method = 'GET') {
  return new NextRequest('http://localhost/api/user/presence-token', { method });
}

describe('GET /api/user/presence-token', () => {
  beforeEach(() => vi.clearAllMocks());

  it('로그인 없으면 401을 반환한다', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('토큰이 있으면 반환한다', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'user@test.com' } });
    (User.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ presenceToken: 'existing-token' }),
      }),
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.token).toBe('existing-token');
  });

  it('토큰이 없으면 null을 반환한다', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'user@test.com' } });
    (User.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ presenceToken: null }),
      }),
    });
    const res = await GET(makeRequest());
    const json = await res.json();
    expect(json.data.token).toBeNull();
  });
});

describe('POST /api/user/presence-token', () => {
  beforeEach(() => vi.clearAllMocks());

  it('로그인 없으면 401을 반환한다', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(makeRequest('POST'));
    expect(res.status).toBe(401);
  });

  it('새 토큰을 생성해서 반환한다', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'user@test.com' } });
    (User.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const res = await POST(makeRequest('POST'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.token).toBe('abc123deadbeef');
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { email: 'user@test.com' },
      { presenceToken: 'abc123deadbeef' }
    );
  });
});

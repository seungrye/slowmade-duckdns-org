import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/models/presence', () => ({
  default: {
    create: vi.fn(),
    find: vi.fn(() => ({ sort: vi.fn(() => ({ lean: vi.fn().mockResolvedValue([]) })) })),
  },
}));
vi.mock('@/models/user', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

import { POST, GET } from './route';
import Presence from '@/models/presence';
import User from '@/models/user';
import { auth } from '@/auth';

function makePostRequest(body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return new NextRequest('http://localhost/api/presence', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/presence');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString());
}

describe('POST /api/presence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('유효한 토큰과 enter 이벤트로 201을 반환한다', async () => {
    (User.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ email: 'user@test.com' }) }),
    });
    (Presence.create as ReturnType<typeof vi.fn>).mockResolvedValue({ _id: { toString: () => 'abc123' } });

    const res = await POST(makePostRequest({ event: 'enter', ssid: 'HomeWifi' }, 'valid-token'));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBe('abc123');
  });

  it('토큰 없으면 401을 반환한다', async () => {
    const res = await POST(makePostRequest({ event: 'enter' }));
    expect(res.status).toBe(401);
  });

  it('DB에 없는 토큰이면 401을 반환한다', async () => {
    (User.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    });
    const res = await POST(makePostRequest({ event: 'enter' }, 'invalid-token'));
    expect(res.status).toBe(401);
  });

  it('event 값이 enter/exit 아니면 400을 반환한다', async () => {
    (User.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ email: 'user@test.com' }) }),
    });
    const res = await POST(makePostRequest({ event: 'invalid' }, 'valid-token'));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/presence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('로그인 없으면 401을 반환한다', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('로그인 시 events와 dailySummary를 반환한다', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'user@test.com' } });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveProperty('events');
    expect(json.data).toHaveProperty('dailySummary');
  });
});

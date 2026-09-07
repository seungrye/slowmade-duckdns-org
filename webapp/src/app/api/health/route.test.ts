import { describe, it, expect, vi, beforeEach } from 'vitest';

// The zero-downtime deploy health check - deploy.sh polls it after starting a new instance.
// #282 - with ?deep=true it pings mongo too (which deploy.sh uses).

const mockPing = vi.fn();
vi.mock('@/lib/db', () => ({
  connectToDB: async () => ({}),
}));
vi.mock('mongoose', async () => {
  const actual = await vi.importActual<typeof import('mongoose')>('mongoose');
  return {
    ...actual,
    default: {
      ...actual.default,
      connection: { db: { admin: () => ({ ping: mockPing }) } },
    },
  };
});

import { GET } from './route';

function makeReq(url: string) {
  return new Request(url) as unknown as Parameters<typeof GET>[0];
}

describe('GET /api/health', () => {
  beforeEach(() => {
    mockPing.mockReset();
  });

  it('200 — 가벼운 헬스 (mongo 검사 없음)', async () => {
    const res = await GET(makeReq('http://x/api/health'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { ok: true } });
    expect(mockPing).not.toHaveBeenCalled();
  });

  it('?deep=true — mongo 핑 성공 시 200', async () => {
    mockPing.mockResolvedValue({ ok: 1 });
    const res = await GET(makeReq('http://x/api/health?deep=true'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, data: { ok: true, mongo: 'ok' } });
    expect(mockPing).toHaveBeenCalledOnce();
  });

  it('?deep=true — mongo 실패 시 503', async () => {
    mockPing.mockRejectedValue(new Error('connection refused'));
    const res = await GET(makeReq('http://x/api/health?deep=true'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ success: false });
  });
});

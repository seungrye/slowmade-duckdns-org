import { describe, it, expect, vi, beforeEach } from 'vitest';

// 무중단 배포 헬스체크 — deploy.sh 가 새 인스턴스 기동 후 폴링한다.
// #282 — ?deep=true 시 mongo 핑까지 (deploy.sh 가 사용).

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

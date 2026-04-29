import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/presence', () => ({
  default: {
    create: vi.fn(),
    find: vi.fn(() => ({ sort: vi.fn(() => ({ lean: vi.fn().mockResolvedValue([]) })) })),
  },
}));

import { POST, GET } from './route';
import Presence from '@/models/presence';

const VALID_KEY = 'test-api-key';

function makePostRequest(body: unknown, apiKey?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  return new Request('http://localhost/api/presence', {
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
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PRESENCE_API_KEY = VALID_KEY;
  });

  it('유효한 API Key와 enter 이벤트로 201을 반환한다', async () => {
    (Presence.create as ReturnType<typeof vi.fn>).mockResolvedValue({ _id: { toString: () => 'abc123' } });
    const res = await POST(makePostRequest({ event: 'enter', ssid: 'HomeWifi' }, VALID_KEY) as never);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBe('abc123');
  });

  it('API Key 없으면 401을 반환한다', async () => {
    const res = await POST(makePostRequest({ event: 'enter' }) as never);
    expect(res.status).toBe(401);
  });

  it('잘못된 API Key면 401을 반환한다', async () => {
    const res = await POST(makePostRequest({ event: 'enter' }, 'wrong-key') as never);
    expect(res.status).toBe(401);
  });

  it('event 값이 enter/exit 아니면 400을 반환한다', async () => {
    const res = await POST(makePostRequest({ event: 'invalid' }, VALID_KEY) as never);
    expect(res.status).toBe(400);
  });

  it('PRESENCE_API_KEY 미설정 시 401을 반환한다', async () => {
    delete process.env.PRESENCE_API_KEY;
    const res = await POST(makePostRequest({ event: 'enter' }, VALID_KEY) as never);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/presence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('events와 dailySummary를 반환한다', async () => {
    const res = await GET(makeGetRequest() as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveProperty('events');
    expect(json.data).toHaveProperty('dailySummary');
  });

  it('days 파라미터를 최대 365로 제한한다', async () => {
    const res = await GET(makeGetRequest({ days: '9999' }) as never);
    expect(res.status).toBe(200);
  });
});

// /api/web-adventure/save — GET / POST 테스트 (#237).
//
// GET: 로그인된 사용자의 현재 save 반환 (없으면 data: null).
// POST: 로그인된 사용자의 save 를 upsert (현재 진행도 갱신).
// 비로그인 → 401.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/models/web-adventure-save', () => ({
  default: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

import { GET, POST } from './route';
import WebAdventureSave from '@/models/web-adventure-save';
import { auth } from '@/auth';

function makeRequest(body?: object, method: 'GET' | 'POST' = body ? 'POST' : 'GET'): NextRequest {
  return new Request('http://localhost/api/web-adventure/save', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

const SAMPLE_SAVE = {
  runIndex: 1,
  character: {
    stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: 10,
    maxHp: 10,
    ability: 'scholar',
    inventory: [],
    flags: {},
    rerollsLeft: 3,
  },
  currentSceneId: 'town_square_dawn',
};

describe('GET /api/web-adventure/save', () => {
  beforeEach(() => vi.clearAllMocks());

  it('비로그인 → 401', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('로그인 + save 없음 → 200 + data:null', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: 'tester@example.com' },
    });
    (WebAdventureSave.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeNull();
  });

  it('로그인 + save 있음 → 200 + data:save', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: 'tester@example.com' },
    });
    const saved = { ...SAMPLE_SAVE, userEmail: 'tester@example.com' };
    (WebAdventureSave.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(saved),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(saved);
  });
});

describe('POST /api/web-adventure/save', () => {
  beforeEach(() => vi.clearAllMocks());

  it('비로그인 → 401', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(makeRequest(SAMPLE_SAVE));
    expect(res.status).toBe(401);
  });

  it('필수 필드 누락 → 400', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: 'tester@example.com' },
    });
    const res = await POST(makeRequest({ runIndex: 1 }));
    expect(res.status).toBe(400);
  });

  it('로그인 + 유효 payload → upsert + 200', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { email: 'tester@example.com' },
    });
    (WebAdventureSave.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...SAMPLE_SAVE,
      userEmail: 'tester@example.com',
    });
    const res = await POST(makeRequest(SAMPLE_SAVE));
    expect(res.status).toBe(200);
    const updateFn = WebAdventureSave.findOneAndUpdate as ReturnType<typeof vi.fn>;
    expect(updateFn).toHaveBeenCalled();
    // upsert: true + userEmail 매칭
    const call = updateFn.mock.calls[0];
    expect(call[0]).toEqual({ userEmail: 'tester@example.com' });
    expect(call[2]).toMatchObject({ upsert: true });
  });
});

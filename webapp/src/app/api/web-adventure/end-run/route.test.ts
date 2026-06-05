// /api/web-adventure/end-run — 엔딩 도달 시 회차 종결 (#239).
//
// 흐름: 현재 save → past_run insert + save 의 runIndex+1 + 캐릭터/씬 reset.
// 클라이언트가 EndingScreen 진입 시 호출. payload: { endingId, finalSceneId }.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/models/web-adventure-save', () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));
vi.mock('@/models/web-adventure-past-run', () => ({
  default: { create: vi.fn(), findOne: vi.fn() },
}));

import { POST } from './route';
import WebAdventureSave from '@/models/web-adventure-save';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import { auth } from '@/auth';

function makeRequest(body: object): NextRequest {
  return new Request('http://localhost/api/web-adventure/end-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const sampleCharacter = {
  stats: { str: 5, dex: 10, int: 5, cha: 5, con: 5, wis: 5 },
  hp: 8,
  maxHp: 10,
  ability: 'scholar',
  inventory: ['super_tintham_cracker'],
  flags: {},
  rerollsLeft: 1,
};

describe('POST /api/web-adventure/end-run', () => {
  beforeEach(() => vi.clearAllMocks());

  it('비로그인 → 401', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(makeRequest({ endingId: 'main', finalSceneId: 'x' }));
    expect(res.status).toBe(401);
  });

  it('payload endingId 누락 → 400', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    const res = await POST(makeRequest({ finalSceneId: 'x' }));
    expect(res.status).toBe(400);
  });

  it('save 없으면 → 404', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    (WebAdventureSave.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });
    const res = await POST(
      makeRequest({ endingId: 'main', finalSceneId: 'elder_house_ending' }),
    );
    expect(res.status).toBe(404);
  });

  it('정상: past_run create + save runIndex+1 + 200', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    (WebAdventureSave.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        userEmail: 'a@b.com',
        runIndex: 1,
        character: sampleCharacter,
        currentSceneId: 'elder_house_ending',
      }),
    });
    (WebAdventurePastRun.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: 'pr1',
    });
    (WebAdventureSave.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await POST(
      makeRequest({ endingId: 'main', finalSceneId: 'elder_house_ending' }),
    );
    expect(res.status).toBe(200);

    // past_run create 인자
    const prCreate = WebAdventurePastRun.create as ReturnType<typeof vi.fn>;
    expect(prCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userEmail: 'a@b.com',
        runIndex: 1,
        endingId: 'main',
        finalSceneId: 'elder_house_ending',
        character: sampleCharacter,
      }),
    );
    // save runIndex+1
    const updateFn = WebAdventureSave.findOneAndUpdate as ReturnType<typeof vi.fn>;
    expect(updateFn).toHaveBeenCalled();
    const call = updateFn.mock.calls[0];
    expect(call[0]).toEqual({ userEmail: 'a@b.com' });
    expect(call[1].runIndex).toBe(2);
  });
});

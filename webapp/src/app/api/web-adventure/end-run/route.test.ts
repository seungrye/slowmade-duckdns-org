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
  default: { create: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn() },
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

  it('정상: past_run upsert + save runIndex+1 + 200 (#252)', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    (WebAdventureSave.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        userEmail: 'a@b.com',
        runIndex: 1,
        character: sampleCharacter,
        currentSceneId: 'elder_house_ending',
      }),
    });
    (WebAdventurePastRun.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: 'pr1',
    });
    (WebAdventureSave.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await POST(
      makeRequest({ endingId: 'main', finalSceneId: 'elder_house_ending' }),
    );
    expect(res.status).toBe(200);

    // past_run upsert — (userEmail, runIndex) 키 + endingId 갱신.
    const prUpsert = WebAdventurePastRun.findOneAndUpdate as ReturnType<typeof vi.fn>;
    expect(prUpsert).toHaveBeenCalled();
    const prCall = prUpsert.mock.calls[0];
    expect(prCall[0]).toEqual({ userEmail: 'a@b.com', runIndex: 1 });
    expect(prCall[1]).toMatchObject({
      endingId: 'main',
      finalSceneId: 'elder_house_ending',
      character: sampleCharacter,
    });
    expect(prCall[2]).toMatchObject({ upsert: true });

    // save runIndex+1
    const updateFn = WebAdventureSave.findOneAndUpdate as ReturnType<typeof vi.fn>;
    expect(updateFn).toHaveBeenCalled();
    const call = updateFn.mock.calls[0];
    expect(call[0]).toEqual({ userEmail: 'a@b.com' });
    expect(call[1].runIndex).toBe(2);
  });

  // #252 — 이전 회차에서 *save 갱신 실패* 등으로 runIndex 가 그대로 남은 상태에서
  //   다시 end-run 호출 시 (= save.runIndex 가 이전 past_run 의 runIndex 와 동일)
  //   기존 create 방식은 unique index 충돌로 400 → save 갱신 안 됨 → 갤러리에서
  //   새 엔딩 안 보임 (사용자 보고). upsert 로 *덮어쓰기* 처리해 재발 방지.
  it('같은 (userEmail, runIndex) 에 다른 endingId 도달 시 upsert 로 덮어쓰기 + save 갱신 정상 (#252)', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    (WebAdventureSave.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        userEmail: 'a@b.com',
        runIndex: 1,
        character: sampleCharacter,
        currentSceneId: 'ending_shopkeeper',
      }),
    });
    // findOneAndUpdate 가 *기존 past_run* 의 _id 와 새 endingId 로 반환 — upsert 정상.
    (WebAdventurePastRun.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _id: 'pr1',
      userEmail: 'a@b.com',
      runIndex: 1,
      endingId: 'shopkeeper',
    });
    (WebAdventureSave.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await POST(
      makeRequest({ endingId: 'shopkeeper', finalSceneId: 'ending_shopkeeper' }),
    );

    // 정상 200 — duplicate 충돌 없음.
    expect(res.status).toBe(200);

    // save 의 runIndex 도 정상 +1.
    const updateFn = WebAdventureSave.findOneAndUpdate as ReturnType<typeof vi.fn>;
    expect(updateFn).toHaveBeenCalled();
    expect(updateFn.mock.calls[0][1].runIndex).toBe(2);
  });
});

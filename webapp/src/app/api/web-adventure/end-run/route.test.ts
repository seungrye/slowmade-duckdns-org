// /api/web-adventure/end-run - ending a run on reaching an ending (#239).
//
// The flow: the current save -> insert a past_run, bump the save's runIndex and reset the character and scene.
// The client calls it on entering EndingScreen. The payload: { endingId, finalSceneId }.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/achievements', () => ({ evaluateAndGrant: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/web-adventure/enqueue-scene-image', () => ({
  // #158 - queueing the illustration is verified by its own tests. Here it is only kept off the DB.
  enqueueSceneImage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/models/web-adventure-save', () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));
vi.mock('@/models/web-adventure-past-run', () => ({
  default: {
    create: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    countDocuments: vi.fn(),
  },
}));
// A logged-out submission is a public write path (#253). The limit itself is the rate-limit tests' concern.
const mockRateLimit = vi.hoisted(() => vi.fn(() => true));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mockRateLimit,
  clientIp: () => '1.2.3.4',
}));
vi.mock('@/lib/env', () => ({ env: { ownerEmail: 'owner@x.com' } }));
vi.mock('@/models/web-adventure-feedback-note', () => ({
  default: { countDocuments: vi.fn(), findOne: vi.fn(), create: vi.fn() },
}));

import { POST } from './route';
import WebAdventureSave from '@/models/web-adventure-save';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import WebAdventureFeedbackNote from '@/models/web-adventure-feedback-note';
import { env } from '@/lib/env';
import { auth } from '@/auth';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

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

// The default mock for enqueueing the automatic feedback note (overridden per test).
function setupAutoEnqueueDefaults() {
  (env as { ownerEmail: string }).ownerEmail = 'owner@x.com';
  asMock(WebAdventureFeedbackNote.countDocuments).mockResolvedValue(0);
  asMock(WebAdventureFeedbackNote.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  asMock(WebAdventureFeedbackNote.create).mockResolvedValue({});
}

describe('POST /api/web-adventure/end-run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAutoEnqueueDefaults();
  });

  // ── A logged-out player's ending (#253) ─────────────────────────────────
  //
  // This used to return 401. The client calls this API when logged out too, and it **silently ignored** the 401,
  // so a complete ending log was thrown away - no feedback note was created.
  //
  // There is no reason to require a login: the note's **owner is the author** (ownerEmail) and the player is merely
  // recorded as sourceUserEmail. Feedback from other people's play is the point of the feature.
  // The app (app-end-run) already does exactly this with a synthetic user.
  describe('비로그인 플레이어 (#253)', () => {
    const anonBody = {
      endingId: 'revolution',
      finalSceneId: 'end_revolution',
      log: ['첫 문장', '두 번째 문장'],
      scenePath: ['s1', 's2'],
      voice: 'epic',
      character: sampleCharacter,
    };

    beforeEach(() => {
      asMock(auth).mockResolvedValue(null);
      mockRateLimit.mockReturnValue(true);
      asMock(WebAdventurePastRun.countDocuments).mockResolvedValue(7);
      asMock(WebAdventurePastRun.create).mockResolvedValue({
        _id: 'pr1', runIndex: 8, endingId: 'revolution', finalSceneId: 'end_revolution',
      });
    });

    it('401 이 아니라 회차를 적치한다 — 이게 이번 수정의 핵심', async () => {
      const res = await POST(makeRequest(anonBody));
      expect(res.status).toBe(200);
      expect(WebAdventurePastRun.create).toHaveBeenCalledTimes(1);
    });

    it('합성 사용자로 남긴다 — 계정이 없으니 붙일 곳이 필요하다', async () => {
      await POST(makeRequest(anonBody));
      const doc = asMock(WebAdventurePastRun.create).mock.calls[0][0];
      expect(doc.userEmail).toBe('web@eternia');
      expect(doc.runIndex).toBe(8); // count + 1
      expect(doc.log).toEqual(['첫 문장', '두 번째 문장']);
    });

    it('보낸 캐릭터를 그대로 남긴다 — 기본값으로 채우면 노트 서사가 실제 플레이와 어긋난다', async () => {
      await POST(makeRequest(anonBody));
      const doc = asMock(WebAdventurePastRun.create).mock.calls[0][0];
      expect(doc.character.ability).toBe('scholar');
      expect(doc.character.hp).toBe(8);
    });

    it('피드백 노트를 작가 소유로 적재하고 출처를 web 으로 남긴다', async () => {
      await POST(makeRequest(anonBody));
      const note = asMock(WebAdventureFeedbackNote.create).mock.calls[0][0];
      expect(note.ownerEmail).toBe('owner@x.com');
      expect(note.sourceUserEmail).toBe('web');
    });

    // A logged-out player has no server save at all. localStorage manages the progress.
    it('서버 save 는 건드리지 않는다', async () => {
      await POST(makeRequest(anonBody));
      expect(WebAdventureSave.findOne).not.toHaveBeenCalled();
      expect(WebAdventureSave.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('요청 1건이 LLM 큐를 채우므로 한도를 넘으면 429', async () => {
      mockRateLimit.mockReturnValue(false);
      const res = await POST(makeRequest(anonBody));
      expect(res.status).toBe(429);
      expect(WebAdventurePastRun.create).not.toHaveBeenCalled();
    });

    it('로그가 없으면 노트를 만들지 않는다 — 살 붙일 게 없다', async () => {
      await POST(makeRequest({ ...anonBody, log: [] }));
      expect(WebAdventureFeedbackNote.create).not.toHaveBeenCalled();
    });

    it('비로그인도 endingId 가 없으면 400', async () => {
      const res = await POST(makeRequest({ finalSceneId: 'x' }));
      expect(res.status).toBe(400);
      expect(WebAdventurePastRun.create).not.toHaveBeenCalled();
    });

    // Every anonymous play gathers on one synthetic user, so runIndex collides.
    it('runIndex 가 부딪히면 다시 세어 재시도한다', async () => {
      asMock(WebAdventurePastRun.create)
        .mockRejectedValueOnce(new Error('E11000 duplicate key'))
        .mockResolvedValueOnce({ _id: 'pr2', runIndex: 9, endingId: 'r', finalSceneId: 'f' });
      const res = await POST(makeRequest(anonBody));
      expect(res.status).toBe(200);
      expect(WebAdventurePastRun.create).toHaveBeenCalledTimes(2);
    });
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

    // The past_run upsert - keyed on (userEmail, runIndex), with endingId refreshed.
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

  it('log(서사 로그) 전달 시 past_run upsert 에 포함되고 방어적으로 캡된다', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    (WebAdventureSave.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        userEmail: 'a@b.com',
        runIndex: 1,
        character: sampleCharacter,
        currentSceneId: 'elder_house_ending',
      }),
    });
    (WebAdventurePastRun.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({ _id: 'pr1' });
    (WebAdventureSave.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const bigLog = Array.from({ length: 6000 }, (_, i) => `line ${i}`);
    bigLog.push('x'.repeat(9000)); // a very long entry
    const res = await POST(
      makeRequest({ endingId: 'main', finalSceneId: 'elder_house_ending', log: bigLog }),
    );
    expect(res.status).toBe(200);

    const prCall = (WebAdventurePastRun.findOneAndUpdate as ReturnType<typeof vi.fn>).mock.calls[0];
    const savedLog = prCall[1].log as string[];
    expect(Array.isArray(savedLog)).toBe(true);
    expect(savedLog.length).toBeLessThanOrEqual(5000); // the entry-count cap
    expect(savedLog.every((s) => s.length <= 4000)).toBe(true); // the entry-length cap
  });

  it('log 미전달/비배열이면 빈 배열로 저장', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { email: 'a@b.com' } });
    (WebAdventureSave.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        userEmail: 'a@b.com',
        runIndex: 1,
        character: sampleCharacter,
        currentSceneId: 'elder_house_ending',
      }),
    });
    (WebAdventurePastRun.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({ _id: 'pr1' });
    (WebAdventureSave.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await POST(makeRequest({ endingId: 'main', finalSceneId: 'x', log: 'not-array' }));
    expect(res.status).toBe(200);
    const prCall = (WebAdventurePastRun.findOneAndUpdate as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(prCall[1].log).toEqual([]);
  });

  // #252 - when a previous run left runIndex unchanged (a *failed save update* and the like) and
  //   end-run is called again (= save.runIndex equals the previous past_run's runIndex),
  //   the old create approach hit a unique-index collision and returned 400 -> the save was never updated -> the
  //   new ending never appeared in the gallery (as reported). An upsert *overwrites* instead and prevents a recurrence.
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
    // findOneAndUpdate returns *the existing past_run's* _id with the new endingId - the upsert worked.
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

    // a normal 200 - no duplicate collision.
    expect(res.status).toBe(200);

    // the save's runIndex is properly +1 too.
    const updateFn = WebAdventureSave.findOneAndUpdate as ReturnType<typeof vi.fn>;
    expect(updateFn).toHaveBeenCalled();
    expect(updateFn.mock.calls[0][1].runIndex).toBe(2);
  });
});

// #9 - a feedback note is created automatically on an ending (for every logged-in player, owned by the author, with a volume cap).
describe('POST /api/web-adventure/end-run — 피드백 노트 자동 생성', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAutoEnqueueDefaults();
    asMock(auth).mockResolvedValue({ user: { email: 'player@x.com' } });
    asMock(WebAdventureSave.findOne).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        userEmail: 'player@x.com', runIndex: 2, character: sampleCharacter, currentSceneId: 's',
      }),
    });
    asMock(WebAdventurePastRun.findOneAndUpdate).mockResolvedValue({
      _id: 'pr9', runIndex: 2, endingId: 'harmony', finalSceneId: 's',
    });
    asMock(WebAdventureSave.findOneAndUpdate).mockResolvedValue({});
  });

  function endReq(log: string[] | undefined) {
    return makeRequest({ endingId: 'harmony', finalSceneId: 's', ...(log ? { log } : {}) });
  }

  it('log 있으면 작가 소유 노트 자동 enqueue(queued, sourceUserEmail=플레이어)', async () => {
    const res = await POST(endReq(['▶ 시작', '→ 선택', '  본문']));
    expect(res.status).toBe(200);
    expect(WebAdventureFeedbackNote.create).toHaveBeenCalledTimes(1);
    const created = asMock(WebAdventureFeedbackNote.create).mock.calls[0][0];
    expect(created).toMatchObject({
      ownerEmail: 'owner@x.com',
      sourceUserEmail: 'player@x.com',
      pastRunId: 'pr9',
      runIndex: 2,
      endingId: 'harmony',
      status: 'queued',
    });
  });

  it('log 없으면 자동생성 안 함', async () => {
    const res = await POST(endReq(undefined));
    expect(res.status).toBe(200);
    expect(WebAdventureFeedbackNote.create).not.toHaveBeenCalled();
  });

  it('대기 노트가 상한 이상이면 skip', async () => {
    asMock(WebAdventureFeedbackNote.countDocuments).mockResolvedValue(20);
    const res = await POST(endReq(['x']));
    expect(res.status).toBe(200);
    expect(WebAdventureFeedbackNote.create).not.toHaveBeenCalled();
  });

  it('같은 회차 노트가 이미 있으면 skip', async () => {
    asMock(WebAdventureFeedbackNote.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: 'existing' }) });
    const res = await POST(endReq(['x']));
    expect(res.status).toBe(200);
    expect(WebAdventureFeedbackNote.create).not.toHaveBeenCalled();
  });

  it('OWNER_EMAIL 미설정이면 자동생성 안 함', async () => {
    (env as { ownerEmail: string }).ownerEmail = '';
    const res = await POST(endReq(['x']));
    expect(res.status).toBe(200);
    expect(WebAdventureFeedbackNote.create).not.toHaveBeenCalled();
  });

  it('자동생성이 throw 해도 엔딩 종결(200)은 유지', async () => {
    asMock(WebAdventureFeedbackNote.countDocuments).mockRejectedValue(new Error('db down'));
    const res = await POST(endReq(['x']));
    expect(res.status).toBe(200);
  });
});

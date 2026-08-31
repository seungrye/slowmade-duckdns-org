// /api/web-adventure/end-run — 엔딩 도달 시 회차 종결 (#239).
//
// 흐름: 현재 save → past_run insert + save 의 runIndex+1 + 캐릭터/씬 reset.
// 클라이언트가 EndingScreen 진입 시 호출. payload: { endingId, finalSceneId }.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/achievements', () => ({ evaluateAndGrant: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/web-adventure/enqueue-scene-image', () => ({
  // #158 — 삽화 큐 적재는 자체 테스트로 검증한다. 여기선 DB 를 안 타게만 한다.
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
// 비로그인 제출은 공개 쓰기 경로다 (#253). 한도 자체는 rate-limit 자체 테스트가 본다.
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

// 자동 피드백 노트 enqueue 를 위한 기본 mock (개별 테스트에서 덮어씀).
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

  // ── 비로그인 플레이어의 엔딩 (#253) ─────────────────────────────────
  //
  // 예전엔 여기서 401 이었다. 클라이언트는 비로그인일 때도 이 API 를 부르는데 401 을
  // 조용히 무시해서, 엔딩 로그가 전부 있는데도 버려졌다 — 피드백 노트가 안 생겼다.
  //
  // 로그인을 요구할 이유가 없다: 노트 **소유자는 작가**(ownerEmail)고 플레이어는
  // sourceUserEmail 로 기록될 뿐이다. 오히려 남의 플레이 피드백이 이 기능의 목적이다.
  // 앱(app-end-run)이 합성 사용자로 이미 그렇게 하고 있다.
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

    // 비로그인은 서버 save 가 아예 없다. 진행도는 localStorage 가 관리한다.
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

    // 합성 사용자 하나에 모든 익명 플레이가 모이므로 runIndex 가 부딪힌다.
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
    bigLog.push('x'.repeat(9000)); // 초장문 항목
    const res = await POST(
      makeRequest({ endingId: 'main', finalSceneId: 'elder_house_ending', log: bigLog }),
    );
    expect(res.status).toBe(200);

    const prCall = (WebAdventurePastRun.findOneAndUpdate as ReturnType<typeof vi.fn>).mock.calls[0];
    const savedLog = prCall[1].log as string[];
    expect(Array.isArray(savedLog)).toBe(true);
    expect(savedLog.length).toBeLessThanOrEqual(5000); // 항목 수 캡
    expect(savedLog.every((s) => s.length <= 4000)).toBe(true); // 항목 길이 캡
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

// #9 — 엔딩 시 피드백 노트 자동 생성(모든 로그인 플레이어, 작가 소유, 볼륨 캡).
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

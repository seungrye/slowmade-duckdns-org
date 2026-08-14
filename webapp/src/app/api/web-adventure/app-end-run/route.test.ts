// /api/web-adventure/app-end-run — 앱 엔딩 제출 (#33)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/web-adventure/enqueue-scene-image', () => ({
  // #158 — 삽화 큐 적재는 자체 테스트로 검증한다. 여기선 DB 를 안 타게만 한다.
  enqueueSceneImage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { appKey: 'appsecret', ownerEmail: 'owner@x.com' } }));
vi.mock('@/lib/web-adventure/hydrate-character', () => ({
  hydrateCharacterSnapshot: (x: unknown) => x ?? {},
}));
vi.mock('@/models/web-adventure-past-run', () => ({
  default: { countDocuments: vi.fn(), create: vi.fn(), findOne: vi.fn() },
}));
vi.mock('@/models/web-adventure-feedback-note', () => ({
  default: { countDocuments: vi.fn(), findOne: vi.fn(), create: vi.fn() },
}));

import { POST, OPTIONS } from './route';
import { env } from '@/lib/env';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import WebAdventureFeedbackNote from '@/models/web-adventure-feedback-note';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
function req(body: object, key: string | null = 'appsecret'): NextRequest {
  return new Request('http://localhost/api/web-adventure/app-end-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'x-app-key': key } : {}) },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('app-end-run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (env as { appKey: string; ownerEmail: string }).appKey = 'appsecret';
    (env as { appKey: string; ownerEmail: string }).ownerEmail = 'owner@x.com';
    asMock(WebAdventureFeedbackNote.countDocuments).mockResolvedValue(0);
    asMock(WebAdventureFeedbackNote.findOne).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    asMock(WebAdventureFeedbackNote.create).mockResolvedValue({ _id: 'note1' });
    asMock(WebAdventurePastRun.countDocuments).mockResolvedValue(4);
    asMock(WebAdventurePastRun.findOne).mockResolvedValue(null); // 기본: 같은 회차 없음
    asMock(WebAdventurePastRun.create).mockResolvedValue({
      _id: 'pr1', runIndex: 5, endingId: 'harmony', finalSceneId: 's',
    });
  });

  it('OPTIONS → 204 + CORS', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('APP_KEY 미설정 → 503', async () => {
    (env as { appKey: string }).appKey = '';
    const res = await POST(req({ endingId: 'harmony', finalSceneId: 's', log: ['x'] }));
    expect(res.status).toBe(503);
  });

  it('키 불일치 → 401', async () => {
    const res = await POST(req({ endingId: 'harmony', finalSceneId: 's' }, 'wrong'));
    expect(res.status).toBe(401);
  });

  it('endingId 누락 → 400', async () => {
    const res = await POST(req({ finalSceneId: 's' }));
    expect(res.status).toBe(400);
  });

  it('정상: 합성 past-run 생성(app@eternia, runIndex=count+1) + 노트 enqueue + 200 + CORS', async () => {
    const res = await POST(req({ endingId: 'harmony', finalSceneId: 's', scenePath: ['a'], log: ['▶ 시작', '→ 선택'] }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');

    const pr = asMock(WebAdventurePastRun.create).mock.calls[0][0];
    expect(pr).toMatchObject({ userEmail: 'app@eternia', runIndex: 5, endingId: 'harmony', finalSceneId: 's' });
    expect(pr.log).toEqual(['▶ 시작', '→ 선택']);

    const note = asMock(WebAdventureFeedbackNote.create).mock.calls[0][0];
    expect(note).toMatchObject({ ownerEmail: 'owner@x.com', sourceUserEmail: 'app', pastRunId: 'pr1', status: 'queued' });
  });

  it('log 비면 노트 enqueue 안 함(그래도 past-run 은 생성, 200)', async () => {
    const res = await POST(req({ endingId: 'harmony', finalSceneId: 's' }));
    expect(res.status).toBe(200);
    expect(WebAdventurePastRun.create).toHaveBeenCalled();
    expect(WebAdventureFeedbackNote.create).not.toHaveBeenCalled();
  });

  // 앱의 재시도 큐(#61)는 응답을 못 받으면 다시 보낸다. 서버가 도달한 적 있는 회차를
  // 걸러내지 않으면 같은 플레이가 두 번 쌓인다. (#63)
  describe('clientRunId 멱등', () => {
    it('이미 저장된 clientRunId 면 새로 만들지 않고 200', async () => {
      asMock(WebAdventurePastRun.findOne).mockResolvedValue({ _id: 'pr-existing', runIndex: 3 });

      const res = await POST(req({ endingId: 'harmony', finalSceneId: 's', clientRunId: 'run-abc' }));

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ duplicate: true });
      expect(WebAdventurePastRun.create).not.toHaveBeenCalled();
      expect(WebAdventureFeedbackNote.create).not.toHaveBeenCalled();
    });

    it('처음 보는 clientRunId 면 생성하고 문서에 함께 저장', async () => {
      const res = await POST(
        req({ endingId: 'harmony', finalSceneId: 's', log: ['a'], clientRunId: 'run-new' }),
      );

      expect(res.status).toBe(200);
      expect(WebAdventurePastRun.create).toHaveBeenCalledWith(
        expect.objectContaining({ clientRunId: 'run-new' }),
      );
    });

    it('clientRunId 가 없으면 종전대로 조회 없이 생성', async () => {
      const res = await POST(req({ endingId: 'harmony', finalSceneId: 's' }));

      expect(res.status).toBe(200);
      expect(WebAdventurePastRun.findOne).not.toHaveBeenCalled();
      expect(WebAdventurePastRun.create).toHaveBeenCalled();
    });

    it('저장 중 clientRunId 가 겹치면(경쟁) 중복으로 보고 200', async () => {
      // 조회 시점엔 없었는데 그 사이 다른 요청이 먼저 넣은 경우.
      asMock(WebAdventurePastRun.findOne)
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ _id: 'pr-race' });
      asMock(WebAdventurePastRun.create).mockRejectedValue(
        new Error('E11000 duplicate key error collection: x index: userEmail_1_clientRunId_1'),
      );

      const res = await POST(req({ endingId: 'harmony', finalSceneId: 's', clientRunId: 'run-race' }));

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ duplicate: true });
    });
  });
});

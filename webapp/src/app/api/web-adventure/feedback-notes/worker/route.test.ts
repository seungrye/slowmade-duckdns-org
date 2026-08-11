// 피드백 노트 큐 워커 테스트 (#9)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse, type NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/require-owner', () => ({ requireOwner: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { llmWorkerKey: 'wkey', llmBaseUrl: 'http://x/v1' } }));
vi.mock('@/models/web-adventure-feedback-note', () => ({
  default: { updateMany: vi.fn(), countDocuments: vi.fn(), findOneAndUpdate: vi.fn() },
}));
vi.mock('@/models/web-adventure-past-run', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/lib/web-adventure/feedback-note', () => ({
  generateFeedbackNote: vi.fn(),
  ENDING_LABEL: { harmony: '조화', petrification: '석화' },
}));

import { POST } from './route';
import { STALE_MS, GEN_TIMEOUT_MS } from '@/lib/web-adventure/feedback-worker-timing';
import { requireOwner } from '@/lib/require-owner';
import WebAdventureFeedbackNote from '@/models/web-adventure-feedback-note';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import { generateFeedbackNote } from '@/lib/web-adventure/feedback-note';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
function req(withKey = true): NextRequest {
  return new Request('http://localhost/api/web-adventure/feedback-notes/worker', {
    method: 'POST',
    headers: withKey ? { 'x-worker-key': 'wkey' } : {},
  }) as unknown as NextRequest;
}
function fakeNote(over: Record<string, unknown> = {}) {
  return {
    _id: 'n1',
    pastRunId: 'run1',
    attempts: 1,
    status: 'processing',
    title: '',
    narrative: '',
    authorNote: '',
    error: '',
    claimedAt: new Date(),
    save: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('feedback-notes worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(WebAdventureFeedbackNote.updateMany).mockResolvedValue({});
  });

  it('무인증(키 틀림 + 비owner) → 404', async () => {
    asMock(requireOwner).mockResolvedValue(NextResponse.json({}, { status: 404 }));
    const res = await POST(req(false));
    expect(res.status).toBe(404);
  });

  it('stale 복구 실행 후 busy 면 claim 안 함', async () => {
    asMock(WebAdventureFeedbackNote.countDocuments).mockResolvedValue(1); // 살아있는 processing
    const res = await POST(req());
    expect(res.status).toBe(200);
    // stale 복구 호출됨
    expect(WebAdventureFeedbackNote.updateMany).toHaveBeenCalled();
    const upd = asMock(WebAdventureFeedbackNote.updateMany).mock.calls[0];
    expect(upd[0]).toMatchObject({ status: 'processing' });
    // busy → claim(findOneAndUpdate) 안 함
    expect(WebAdventureFeedbackNote.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('queued 없으면 idle', async () => {
    asMock(WebAdventureFeedbackNote.countDocuments).mockResolvedValue(0);
    asMock(WebAdventureFeedbackNote.findOneAndUpdate).mockResolvedValue(null);
    const res = await POST(req());
    const body = await res.json();
    expect(body.data.state).toBe('idle');
  });

  it('정상: claim → 생성 → ready 저장', async () => {
    asMock(WebAdventureFeedbackNote.countDocuments).mockResolvedValue(0);
    const note = fakeNote();
    asMock(WebAdventureFeedbackNote.findOneAndUpdate).mockResolvedValue(note);
    asMock(WebAdventurePastRun.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        endingId: 'harmony', finalSceneId: 's', runIndex: 3, scenePath: [], log: ['줄1', '줄2'], character: null,
      }),
    });
    // AI 는 작가 노트만 반환. 서사·제목은 워커가 원본 로그·엔딩으로 채운다.
    asMock(generateFeedbackNote).mockResolvedValue({ title: '', narrative: '', authorNote: 'A' });

    const res = await POST(req());
    const body = await res.json();
    expect(body.data.state).toBe('done');
    expect(note.status).toBe('ready');
    expect(note.authorNote).toBe('A');
    expect(note.narrative).toBe('줄1\n줄2'); // 엔딩 원본 로그
    expect(note.title).toContain('조화'); // 엔딩명 기반 제목
    expect(note.save).toHaveBeenCalled();
  });

  it('생성 실패 + attempts<MAX → queued 재시도', async () => {
    asMock(WebAdventureFeedbackNote.countDocuments).mockResolvedValue(0);
    const note = fakeNote({ attempts: 1 });
    asMock(WebAdventureFeedbackNote.findOneAndUpdate).mockResolvedValue(note);
    asMock(WebAdventurePastRun.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue({ endingId: 'x', finalSceneId: 's', scenePath: [], log: [], character: null }) });
    asMock(generateFeedbackNote).mockRejectedValue(new Error('shim 500'));

    const res = await POST(req());
    const body = await res.json();
    expect(body.data.state).toBe('retry');
    expect(note.status).toBe('queued');
    expect(note.error).toContain('shim 500');
  });

  it('생성 실패 + attempts>=MAX → failed', async () => {
    asMock(WebAdventureFeedbackNote.countDocuments).mockResolvedValue(0);
    const note = fakeNote({ attempts: 3 });
    asMock(WebAdventureFeedbackNote.findOneAndUpdate).mockResolvedValue(note);
    asMock(WebAdventurePastRun.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue({ endingId: 'x', finalSceneId: 's', scenePath: [], log: [], character: null }) });
    asMock(generateFeedbackNote).mockRejectedValue(new Error('boom'));

    const res = await POST(req());
    const body = await res.json();
    expect(body.data.state).toBe('failed');
    expect(note.status).toBe('failed');
  });

  // 저사양 머신에서 생성이 30분을 넘기자, 아직 돌고 있는 작업을 stale 로 판단해 다른 틱이
  // 다시 집어갔다 — 중복 생성 + attempts 소진으로 failed. 두 상수의 대소를 고정한다.
  it('stale 판정은 생성 타임아웃보다 길어야 한다', () => {
    expect(STALE_MS).toBeGreaterThan(GEN_TIMEOUT_MS);
  });
});

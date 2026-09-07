// Tests for the feedback-note queue worker (#9)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse, type NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/require-owner', () => ({ requireOwner: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { llmWorkerKey: 'wkey', llmBaseUrl: 'http://x/v1' } }));
vi.mock('@/models/web-adventure-feedback-note', () => ({
  default: { updateMany: vi.fn(), countDocuments: vi.fn(), findOneAndUpdate: vi.fn() },
}));
vi.mock('@/models/web-adventure-past-run', () => ({ default: { findById: vi.fn() } }));
// #163 - the worker puts the scene list (titles) in the prompt. Here it is only kept off the DB.
vi.mock('@/models/web-adventure-scene', () => ({
  default: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
}));
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
    asMock(WebAdventureFeedbackNote.countDocuments).mockResolvedValue(1); // a live processing item
    const res = await POST(req());
    expect(res.status).toBe(200);
    // stale recovery was called
    expect(WebAdventureFeedbackNote.updateMany).toHaveBeenCalled();
    const upd = asMock(WebAdventureFeedbackNote.updateMany).mock.calls[0];
    expect(upd[0]).toMatchObject({ status: 'processing' });
    // busy -> no claim (findOneAndUpdate)
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
    // The AI returns only the author's note. The worker fills the narrative and title from the original log and ending.
    asMock(generateFeedbackNote).mockResolvedValue({ title: '', narrative: '', authorNote: 'A' });

    const res = await POST(req());
    const body = await res.json();
    expect(body.data.state).toBe('done');
    expect(note.status).toBe('ready');
    expect(note.authorNote).toBe('A');
    expect(note.narrative).toBe('줄1\n줄2'); // the ending's original log
    expect(note.title).toContain('조화'); // a title based on the ending's name
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

  // When generation exceeded 30 minutes on a low-spec machine, a job still running was judged stale and picked up by
  // another tick - duplicating the generation and exhausting attempts into failed. The two constants' order is pinned.
  it('stale 판정은 생성 타임아웃보다 길어야 한다', () => {
    expect(STALE_MS).toBeGreaterThan(GEN_TIMEOUT_MS);
  });
});

// ── #101 an interruption (the process dying) does not consume a retry ─────────────────────
//
// When a deploy terminates the instance, even the catch cannot run and the note is left processing. Stale recovery
// later returns it to queued, but the attempts raised at claim time stayed as they were. So
// **three deploys made it a failed note needing manual intervention** (a real incident on 2026-08-12).
// An attempt that never recorded its outcome does not count as an attempt.
describe('중단된 작업의 재시도 횟수 (#101)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(requireOwner).mockResolvedValue({ email: 'o@x' });
    asMock(WebAdventureFeedbackNote.countDocuments).mockResolvedValue(0);
    asMock(WebAdventureFeedbackNote.findOneAndUpdate).mockResolvedValue(null); // it ends as idle
  });

  it('stale 복구는 attempts 를 되돌린다', async () => {
    await POST({ headers: new Headers({ 'x-worker-key': 'wkey' }) } as unknown as NextRequest);

    const [filter, update] = asMock(WebAdventureFeedbackNote.updateMany).mock.calls[0];
    expect(filter.status).toBe('processing');
    // returning it to queued decrements attempts by one.
    expect(update.$inc).toEqual({ attempts: -1 });
    expect(update.$set ?? update).toMatchObject({ status: 'queued' });
  });

  it('되돌린 attempts 가 음수가 되지 않도록 조건을 건다', async () => {
    await POST({ headers: new Headers({ 'x-worker-key': 'wkey' }) } as unknown as NextRequest);
    const [filter] = asMock(WebAdventureFeedbackNote.updateMany).mock.calls[0];
    expect(filter.attempts).toMatchObject({ $gt: 0 });
  });
});

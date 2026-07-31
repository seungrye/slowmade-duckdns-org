// /api/web-adventure/feedback-notes — 목록/enqueue (#9)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse, type NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/require-owner', () => ({ requireOwner: vi.fn() }));
vi.mock('@/models/web-adventure-past-run', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/models/web-adventure-feedback-note', () => ({
  default: { create: vi.fn(), find: vi.fn() },
}));

import { GET, POST } from './route';
import { requireOwner } from '@/lib/require-owner';
import WebAdventurePastRun from '@/models/web-adventure-past-run';
import WebAdventureFeedbackNote from '@/models/web-adventure-feedback-note';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const ownerOk = () => asMock(requireOwner).mockResolvedValue({ email: 'owner@x.com' });
const ownerDeny = () =>
  asMock(requireOwner).mockResolvedValue(NextResponse.json({ message: 'Not found' }, { status: 404 }));

function req(body: object): NextRequest {
  return new Request('http://localhost/api/web-adventure/feedback-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('feedback-notes route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('비owner → GET 404', async () => {
    ownerDeny();
    expect((await GET()).status).toBe(404);
  });

  it('비owner → POST 404', async () => {
    ownerDeny();
    expect((await POST(req({ pastRunId: 'x' }))).status).toBe(404);
  });

  it('pastRunId 누락 → 400', async () => {
    ownerOk();
    expect((await POST(req({}))).status).toBe(400);
  });

  it('회차 없음 → 404', async () => {
    ownerOk();
    asMock(WebAdventurePastRun.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    expect((await POST(req({ pastRunId: '507f1f77bcf86cd799439011' }))).status).toBe(404);
  });

  it('정상 enqueue → status=queued 노트 생성 + 201', async () => {
    ownerOk();
    asMock(WebAdventurePastRun.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'run1',
        userEmail: 'player@x.com',
        runIndex: 3,
        endingId: 'harmony',
        finalSceneId: 'scene_end',
      }),
    });
    asMock(WebAdventureFeedbackNote.create).mockResolvedValue({ _id: 'note1', status: 'queued' });

    const res = await POST(req({ pastRunId: 'run1' }));
    expect(res.status).toBe(201);
    const created = asMock(WebAdventureFeedbackNote.create).mock.calls[0][0];
    expect(created).toMatchObject({
      ownerEmail: 'owner@x.com',
      pastRunId: 'run1',
      sourceUserEmail: 'player@x.com',
      runIndex: 3,
      endingId: 'harmony',
      status: 'queued',
    });
  });

  it('GET: owner 노트 목록 반환', async () => {
    ownerOk();
    const chain = {
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([{ _id: 'n1' }]),
    };
    asMock(WebAdventureFeedbackNote.find).mockReturnValue(chain);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(asMock(WebAdventureFeedbackNote.find).mock.calls[0][0]).toMatchObject({
      ownerEmail: 'owner@x.com',
    });
  });
});

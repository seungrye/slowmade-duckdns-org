// /api/web-adventure/feedback-notes/[id] — 단건/삭제 (#9)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse, type NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/require-owner', () => ({ requireOwner: vi.fn() }));
vi.mock('@/models/web-adventure-feedback-note', () => ({
  default: { findById: vi.fn(), findOneAndUpdate: vi.fn() },
}));

import { GET, DELETE } from './route';
import { requireOwner } from '@/lib/require-owner';
import WebAdventureFeedbackNote from '@/models/web-adventure-feedback-note';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const ownerOk = () => asMock(requireOwner).mockResolvedValue({ email: 'owner@x.com' });
const ownerDeny = () =>
  asMock(requireOwner).mockResolvedValue(NextResponse.json({ message: 'Not found' }, { status: 404 }));
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const rq = () => new Request('http://localhost') as unknown as NextRequest;

describe('feedback-notes/[id] route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('비owner → GET 404', async () => {
    ownerDeny();
    expect((await GET(rq(), ctx('n1'))).status).toBe(404);
  });

  it('GET 정상', async () => {
    ownerOk();
    asMock(WebAdventureFeedbackNote.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'n1', ownerEmail: 'owner@x.com', isDeleted: false }),
    });
    expect((await GET(rq(), ctx('n1'))).status).toBe(200);
  });

  it('다른 owner 노트 → 404', async () => {
    ownerOk();
    asMock(WebAdventureFeedbackNote.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'n1', ownerEmail: 'someone@else.com', isDeleted: false }),
    });
    expect((await GET(rq(), ctx('n1'))).status).toBe(404);
  });

  it('삭제된 노트 → 404', async () => {
    ownerOk();
    asMock(WebAdventureFeedbackNote.findById).mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: 'n1', ownerEmail: 'owner@x.com', isDeleted: true }),
    });
    expect((await GET(rq(), ctx('n1'))).status).toBe(404);
  });

  it('DELETE: soft-delete 성공', async () => {
    ownerOk();
    asMock(WebAdventureFeedbackNote.findOneAndUpdate).mockResolvedValue({ _id: 'n1', isDeleted: true });
    const res = await DELETE(rq(), ctx('n1'));
    expect(res.status).toBe(200);
    const upd = asMock(WebAdventureFeedbackNote.findOneAndUpdate).mock.calls[0];
    expect(upd[0]).toMatchObject({ _id: 'n1', ownerEmail: 'owner@x.com' });
    expect(upd[1]).toMatchObject({ isDeleted: true });
  });

  it('DELETE: 없으면 404', async () => {
    ownerOk();
    asMock(WebAdventureFeedbackNote.findOneAndUpdate).mockResolvedValue(null);
    expect((await DELETE(rq(), ctx('n1'))).status).toBe(404);
  });
});

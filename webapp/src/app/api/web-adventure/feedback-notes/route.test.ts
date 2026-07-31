// /api/web-adventure/feedback-notes — 목록(GET) (#9, #11)
// 수동 생성(POST)은 제거됨 — 노트는 엔딩 시 자동 생성만.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/require-owner', () => ({ requireOwner: vi.fn() }));
vi.mock('@/models/web-adventure-feedback-note', () => ({
  default: { find: vi.fn() },
}));

import { GET } from './route';
import { requireOwner } from '@/lib/require-owner';
import WebAdventureFeedbackNote from '@/models/web-adventure-feedback-note';

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const ownerOk = () => asMock(requireOwner).mockResolvedValue({ email: 'owner@x.com' });
const ownerDeny = () =>
  asMock(requireOwner).mockResolvedValue(NextResponse.json({ message: 'Not found' }, { status: 404 }));

describe('feedback-notes route (GET 목록)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('비owner → GET 404', async () => {
    ownerDeny();
    expect((await GET()).status).toBe(404);
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

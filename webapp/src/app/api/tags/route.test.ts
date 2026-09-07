// The wiring of privacy handling in tag autocomplete (#230).
//
// The rule itself (`privacyMatch`) is lib/posts.test.ts's concern. This checks only **that the route reads the
// session and passes it to that rule** - writing the rule twice would let the copies diverge.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));

const mockGetAllTags = vi.hoisted(() => vi.fn());
// A marker is returned in place of the real rule - the wiring is checked by whether that marker reaches the $match.
const mockPrivacyMatch = vi.hoisted(() => vi.fn(() => ({ __privacy: 'marker' })));
vi.mock('@/lib/posts', () => ({
  __getAllTags: mockGetAllTags,
  privacyMatch: mockPrivacyMatch,
}));

const mockAggregate = vi.hoisted(() => vi.fn());
vi.mock('@/models/post', () => ({ default: { aggregate: mockAggregate } }));

import { GET } from './route';

const req = (q?: string) =>
  new NextRequest(`http://localhost/api/tags${q === undefined ? '' : `?q=${q}`}`);

describe('GET /api/tags — 비공개 태그 처리', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllTags.mockResolvedValue([{ tag: 'ai-req', count: 1 }]);
    mockAggregate.mockResolvedValue([{ _id: 'ai-req' }]);
    mockPrivacyMatch.mockReturnValue({ __privacy: 'marker' });
    mockAuth.mockResolvedValue({ user: { email: 'me@x.test' } });
  });

  it('q 없이 부르면 로그인 이메일을 그대로 넘긴다', async () => {
    await GET(req());
    expect(mockGetAllTags).toHaveBeenCalledWith('me@x.test');
  });

  it('비로그인이면 null 을 넘긴다 — 공개 태그만 나온다', async () => {
    mockAuth.mockResolvedValueOnce(null);
    await GET(req());
    expect(mockGetAllTags).toHaveBeenCalledWith(null);
  });

  it('q 검색도 같은 규칙을 쓴다', async () => {
    await GET(req('ai'));
    expect(mockPrivacyMatch).toHaveBeenCalledWith('me@x.test');
    const pipeline = mockAggregate.mock.calls[0][0] as Record<string, unknown>[];
    const match = (pipeline[0] as { $match: Record<string, unknown> }).$match;
    expect(match.__privacy).toBe('marker');
  });

  // A hard filter left beside the rule is ANDed with it and neuters it.
  it('q 검색에 하드 isPrivate 필터가 남아 있으면 안 된다', async () => {
    await GET(req('ai'));
    const pipeline = mockAggregate.mock.calls[0][0] as Record<string, unknown>[];
    const match = (pipeline[0] as { $match: Record<string, unknown> }).$match;
    expect(match.isPrivate).toBeUndefined();
  });

  it('삭제된 글은 여전히 제외한다', async () => {
    await GET(req('ai'));
    const pipeline = mockAggregate.mock.calls[0][0] as Record<string, unknown>[];
    const match = (pipeline[0] as { $match: Record<string, unknown> }).$match;
    expect(match.isDeleted).toEqual({ $ne: true });
  });
});

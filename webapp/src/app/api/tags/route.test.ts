// 태그 자동완성의 비공개 처리 배선 (#230).
//
// 규칙 자체(`privacyMatch`)는 lib/posts.test.ts 가 본다. 여기서는 **라우트가 세션을 읽어
// 그 규칙에 넘기는지**만 확인한다 — 규칙을 두 벌로 적어 두면 갈라진다.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));

const mockGetAllTags = vi.hoisted(() => vi.fn());
// 실제 규칙 대신 표식을 돌려준다 — 그 표식이 $match 에 실려 가는지로 배선을 본다.
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

  // 하드 필터가 규칙 옆에 남아 있으면 AND 로 묶여 규칙이 무력해진다.
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

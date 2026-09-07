import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/lib/env', () => ({
  env: { points: { deletePostCost: 10 } },
}));
vi.mock('@/models/post', () => ({
  default: { aggregate: vi.fn().mockResolvedValue([{ posts: [], total: 0 }]) },
}));
vi.mock('@/models/user', () => ({ default: {} }));
vi.mock('@/models/comment', () => ({ default: {} }));

import Post from '@/models/post';
import { getPaginatedPosts, __getAllTags } from './posts';

// a helper that extracts the $facet.data pipeline
function getFacetData(pipeline: unknown[]): unknown[] {
  const facet = pipeline.find(
    (s): s is { $facet: { data: unknown[] } } =>
      typeof s === 'object' && s !== null && '$facet' in s
  );
  return facet?.$facet.data ?? [];
}

function hasLookupFromComments(stages: unknown[]): boolean {
  return stages.some(
    (s): boolean =>
      typeof s === 'object' &&
      s !== null &&
      '$lookup' in s &&
      (s as { $lookup: { from: string } }).$lookup.from === 'comments'
  );
}

describe('getPaginatedPosts — aggregation pipeline', () => {
  beforeEach(() => {
    (Post.aggregate as Mock).mockClear();
    (Post.aggregate as Mock).mockResolvedValue([{ posts: [], total: 0 }]);
  });

  it("sort='commented'일 때 $facet.data에 $lookup이 없다", async () => {
    await getPaginatedPosts(1, 12, 'commented', null, true);
    const [pipeline] = (Post.aggregate as Mock).mock.calls[0];
    const dataStages = getFacetData(pipeline);
    expect(hasLookupFromComments(dataStages)).toBe(false);
  });

  it("sort='commented'일 때 pre-facet 단계에 $lookup이 있다", async () => {
    await getPaginatedPosts(1, 12, 'commented');
    const [pipeline] = (Post.aggregate as Mock).mock.calls[0];
    const facetIndex = pipeline.findIndex(
      (s: unknown) => typeof s === 'object' && s !== null && '$facet' in s
    );
    const preFacet = pipeline.slice(0, facetIndex);
    expect(hasLookupFromComments(preFacet)).toBe(true);
  });

  it("sort='latest', withComments=true일 때 $facet.data에 $lookup이 있다", async () => {
    await getPaginatedPosts(1, 12, 'latest', null, true);
    const [pipeline] = (Post.aggregate as Mock).mock.calls[0];
    const dataStages = getFacetData(pipeline);
    expect(hasLookupFromComments(dataStages)).toBe(true);
  });

  it("sort='popular', withComments=true일 때 $facet.data에 $lookup이 있다", async () => {
    await getPaginatedPosts(1, 12, 'popular', null, true);
    const [pipeline] = (Post.aggregate as Mock).mock.calls[0];
    const dataStages = getFacetData(pipeline);
    expect(hasLookupFromComments(dataStages)).toBe(true);
  });

  it('withComments=false이면 $facet.data에 $lookup이 없다', async () => {
    await getPaginatedPosts(1, 12, 'latest', null, false);
    const [pipeline] = (Post.aggregate as Mock).mock.calls[0];
    const dataStages = getFacetData(pipeline);
    expect(hasLookupFromComments(dataStages)).toBe(false);
  });

  it('withComments=false, sort=commented이면 $facet.data에 $lookup이 없다', async () => {
    await getPaginatedPosts(1, 12, 'commented', null, false);
    const [pipeline] = (Post.aggregate as Mock).mock.calls[0];
    const dataStages = getFacetData(pipeline);
    expect(hasLookupFromComments(dataStages)).toBe(false);
  });
});

// Privacy handling in the tag cloud (#230).
//
// Tagging a private post kept it out of the cloud **even for its own author**. The individual tag page
// (`/tags/[tag]`) includes the author's private posts through `privacyMatch(viewerEmail)`, but the cloud that would
// take you there never received a session and excluded them outright - the intent lived on only one side.
describe('__getAllTags — 태그 클라우드 비공개 처리', () => {
  beforeEach(() => {
    (Post.aggregate as Mock).mockClear();
    (Post.aggregate as Mock).mockResolvedValue([]);
  });

  function firstMatch(): Record<string, unknown> {
    const pipeline = (Post.aggregate as Mock).mock.calls[0][0] as Record<string, unknown>[];
    const stage = pipeline.find((s) => '$match' in s) as { $match: Record<string, unknown> };
    return stage.$match;
  }

  it('뷰어가 없으면 공개 글만 센다', async () => {
    await __getAllTags();
    const m = firstMatch();
    expect(m.isPrivate).toEqual({ $ne: true });
    expect(m.$or).toBeUndefined();
  });

  it('뷰어가 있으면 자기 비공개 글의 태그도 센다', async () => {
    await __getAllTags('me@x.test');
    expect(firstMatch().$or).toEqual([
      { isPrivate: { $ne: true } },
      { userEmail: 'me@x.test' },
    ]);
  });

  // A hard filter left beside the $or is ANDed with it and neuters it - and it does not get fixed quietly.
  it('뷰어가 있을 때 하드 isPrivate 필터가 남아 있으면 안 된다', async () => {
    await __getAllTags('me@x.test');
    expect(firstMatch().isPrivate).toBeUndefined();
  });

  it('삭제된 글은 뷰어와 무관하게 제외한다', async () => {
    await __getAllTags('me@x.test');
    expect(firstMatch().isDeleted).toEqual({ $ne: true });
  });
});

// Title search on the main screen (#232).
//
// __fetchPosts always filtered titles by query but was never exposed, and it used
// **user input directly as a regex**. The moment a search box is attached, a single `(` gives a 500.
describe('getPaginatedPosts — 제목 검색', () => {
  beforeEach(() => {
    (Post.aggregate as Mock).mockClear();
    (Post.aggregate as Mock).mockResolvedValue([{ posts: [], total: 0 }]);
  });

  function firstMatch(): Record<string, unknown> {
    const pipeline = (Post.aggregate as Mock).mock.calls[0][0] as Record<string, unknown>[];
    const stage = pipeline.find((s) => '$match' in s) as { $match: Record<string, unknown> };
    return stage.$match;
  }

  it('검색어가 없으면 title 조건을 붙이지 않는다', async () => {
    await getPaginatedPosts(1, 9, 'latest', null, true, null);
    expect(firstMatch().title).toBeUndefined();
  });

  it('검색어를 주면 제목으로 거른다', async () => {
    await getPaginatedPosts(1, 9, 'latest', null, true, null, '고양이');
    expect(firstMatch().title).toEqual({ $regex: '고양이', $options: 'i' });
  });

  // Without escaping, one `(` makes an invalid regex and returns 500.
  it('정규식 특수문자를 이스케이프한다', async () => {
    await getPaginatedPosts(1, 9, 'latest', null, true, null, 'a(b');
    expect((firstMatch().title as { $regex: string }).$regex).toBe('a\\(b');
  });

  it('와일드카드로 쓰이지 않게 .* 도 이스케이프한다', async () => {
    await getPaginatedPosts(1, 9, 'latest', null, true, null, '.*');
    expect((firstMatch().title as { $regex: string }).$regex).toBe('\\.\\*');
  });

  // Search must not leak someone else's private posts.
  it('검색 중에도 비공개 규칙이 그대로 붙는다', async () => {
    await getPaginatedPosts(1, 9, 'latest', null, true, 'me@x.test', '고양이');
    expect(firstMatch().$or).toEqual([
      { isPrivate: { $ne: true } },
      { userEmail: 'me@x.test' },
    ]);
  });
});

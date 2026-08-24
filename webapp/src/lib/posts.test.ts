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

// $facet.data 파이프라인 추출 헬퍼
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

// 태그 클라우드의 비공개 처리 (#230).
//
// 비공개 글에 태그를 달아도 **작성자 본인에게조차** 클라우드에 안 나왔다. 개별 태그 페이지
// (`/tags/[tag]`)는 `privacyMatch(viewerEmail)` 로 본인 비공개 글을 포함하는데, 거기로
// 데려다줄 클라우드는 세션을 받지도 않고 무조건 제외했다 — 의도가 한쪽에만 반영돼 있었다.
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

  // 하드 필터가 $or 옆에 남아 있으면 AND 로 묶여 $or 이 무력해진다 — 조용히 안 고쳐진다.
  it('뷰어가 있을 때 하드 isPrivate 필터가 남아 있으면 안 된다', async () => {
    await __getAllTags('me@x.test');
    expect(firstMatch().isPrivate).toBeUndefined();
  });

  it('삭제된 글은 뷰어와 무관하게 제외한다', async () => {
    await __getAllTags('me@x.test');
    expect(firstMatch().isDeleted).toEqual({ $ne: true });
  });
});

// 메인 화면 제목 검색 (#232).
//
// __fetchPosts 는 원래부터 query 로 제목을 걸렀지만 밖으로 노출돼 있지 않았고,
// **사용자 입력을 정규식으로 그대로** 썼다. 검색창을 붙이는 순간 `(` 하나로 500 이 난다.
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

  // 이스케이프가 없으면 `(` 하나로 잘못된 정규식이 되어 500 이 난다.
  it('정규식 특수문자를 이스케이프한다', async () => {
    await getPaginatedPosts(1, 9, 'latest', null, true, null, 'a(b');
    expect((firstMatch().title as { $regex: string }).$regex).toBe('a\\(b');
  });

  it('와일드카드로 쓰이지 않게 .* 도 이스케이프한다', async () => {
    await getPaginatedPosts(1, 9, 'latest', null, true, null, '.*');
    expect((firstMatch().title as { $regex: string }).$regex).toBe('\\.\\*');
  });

  // 검색으로 남의 비공개 글이 새면 안 된다.
  it('검색 중에도 비공개 규칙이 그대로 붙는다', async () => {
    await getPaginatedPosts(1, 9, 'latest', null, true, 'me@x.test', '고양이');
    expect(firstMatch().$or).toEqual([
      { isPrivate: { $ne: true } },
      { userEmail: 'me@x.test' },
    ]);
  });
});

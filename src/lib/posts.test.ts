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
import { getPaginatedPosts } from './posts';

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

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/posts', () => ({ getPaginatedPosts: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn(() => Promise.resolve(null)) })); // 비로그인 뷰어 기본

import { GET } from './route';
import { getPaginatedPosts } from '@/lib/posts';

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/posts');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString());
}

describe('GET /api/posts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('기본 파라미터로 getPaginatedPosts를 호출한다', async () => {
    (getPaginatedPosts as ReturnType<typeof vi.fn>).mockResolvedValue({ posts: [], total: 0 });
    await GET(makeRequest());
    expect(getPaginatedPosts).toHaveBeenCalledWith(1, 9, 'latest', null, true, null, null);
  });

  it('page, limit, sort 파라미터를 전달한다', async () => {
    (getPaginatedPosts as ReturnType<typeof vi.fn>).mockResolvedValue({ posts: [], total: 0 });
    await GET(makeRequest({ page: '2', limit: '5', sort: 'popular' }));
    expect(getPaginatedPosts).toHaveBeenCalledWith(2, 5, 'popular', null, true, null, null);
  });

  it('email 파라미터를 전달한다', async () => {
    (getPaginatedPosts as ReturnType<typeof vi.fn>).mockResolvedValue({ posts: [], total: 0 });
    await GET(makeRequest({ email: 'a@test.com' }));
    expect(getPaginatedPosts).toHaveBeenCalledWith(1, 9, 'latest', 'a@test.com', true, null, null);
  });

  it('200과 posts/total 데이터를 반환한다', async () => {
    (getPaginatedPosts as ReturnType<typeof vi.fn>).mockResolvedValue({
      posts: [{ _id: 'p1' }],
      total: 1,
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.total).toBe(1);
    expect(body.data.posts).toHaveLength(1);
  });

  it('유효하지 않은 sort는 undefined로 처리된다', async () => {
    (getPaginatedPosts as ReturnType<typeof vi.fn>).mockResolvedValue({ posts: [], total: 0 });
    await GET(makeRequest({ sort: 'invalid' }));
    // SortOptionSchema.safeParse 실패 시 data=undefined → getPaginatedPosts에 undefined 전달
    expect(getPaginatedPosts).toHaveBeenCalledWith(1, 9, undefined, null, true, null, null);
  });

  it('limit이 50을 초과하면 50으로 제한된다 (M-2)', async () => {
    (getPaginatedPosts as ReturnType<typeof vi.fn>).mockResolvedValue({ posts: [], total: 0 });
    await GET(makeRequest({ limit: '100000' }));
    expect(getPaginatedPosts).toHaveBeenCalledWith(1, 50, expect.anything(), null, true, null, null);
  });

  it('page가 0 이하이면 1로 제한된다 (M-2)', async () => {
    (getPaginatedPosts as ReturnType<typeof vi.fn>).mockResolvedValue({ posts: [], total: 0 });
    await GET(makeRequest({ page: '-5' }));
    expect(getPaginatedPosts).toHaveBeenCalledWith(1, 9, expect.anything(), null, true, null, null);
  });
});

// 메인 화면 제목 검색 (#232) — 전체 글에서 찾아야 하므로 서버로 넘긴다.
describe('GET /api/posts — q(제목 검색)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getPaginatedPosts as ReturnType<typeof vi.fn>).mockResolvedValue({ posts: [], total: 0 });
  });

  it('q 를 마지막 인자로 전달한다', async () => {
    await GET(makeRequest({ q: '고양이' }));
    expect(getPaginatedPosts).toHaveBeenCalledWith(1, 9, 'latest', null, true, null, '고양이');
  });

  // 검색창을 비우면 전체 목록으로 돌아와야 한다.
  it('공백만이면 검색어로 치지 않는다', async () => {
    await GET(makeRequest({ q: '   ' }));
    expect(getPaginatedPosts).toHaveBeenCalledWith(1, 9, 'latest', null, true, null, null);
  });

  it('q 가 없으면 null 을 넘긴다', async () => {
    await GET(makeRequest());
    expect(getPaginatedPosts).toHaveBeenCalledWith(1, 9, 'latest', null, true, null, null);
  });
});

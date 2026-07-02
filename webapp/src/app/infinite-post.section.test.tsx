// 홈 초기 목록 SSR화: InfinitPostList 가 서버(page.tsx)에서 SSR 로드한 initialPosts 를
// 받으면 첫 페이지 CSR fetch(/api/posts?page=1) 를 건너뛰고 즉시 렌더한다. initialPosts 가
// 없으면 기존대로 마운트 시 첫 페이지를 fetch 한다(하위호환).
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { GetPostType } from "@/types/posts.d";

// jsdom 미제공 — 무한스크롤/topmost 추적이 마운트 시 참조. 콜백 미발화 stub 이면 충분.
class StubIntersectionObserver {
  constructor(_cb: unknown) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);

// PostItem 은 렌더 의존성 격리를 위해 최소 stub — 이 테스트는 fetch 계약만 검증.
vi.mock("../components/post-item", () => ({
  default: ({ post }: { post: GetPostType }) => (
    <div data-testid={`post-${post._id}`}>{post.title}</div>
  ),
  PostItemSkeleton: () => <div data-testid="skeleton" />,
}));

import InfinitPostList from "./infinite-post.section";

const mkPosts = (n: number): GetPostType[] =>
  Array.from({ length: n }, (_, i) => ({ _id: `p${i}`, title: `제목${i}` }) as unknown as GetPostType);

const okEmpty = () =>
  vi.fn(async () => new Response(JSON.stringify({ data: { posts: [] } }), { status: 200 }));

describe("InfinitPostList — SSR initialPosts 주입", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("initialPosts 를 받으면 첫 페이지 CSR fetch 없이 즉시 렌더한다", () => {
    const fetchSpy = okEmpty();
    vi.stubGlobal("fetch", fetchSpy);

    render(<InfinitPostList initialPosts={mkPosts(9)} />);

    // SSR 주입분이 스켈레톤 없이 즉시 보인다.
    expect(screen.getByTestId("post-p0")).toBeInTheDocument();
    expect(screen.queryByTestId("skeleton")).toBeNull();
    // render 는 useEffect 까지 flush 하므로, 이 시점에 첫 페이지 fetch 가 없어야 한다.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("initialPosts 가 없으면 마운트 시 /api/posts?page=1&limit=9 를 호출한다(하위호환)", async () => {
    const fetchSpy = okEmpty();
    vi.stubGlobal("fetch", fetchSpy);

    render(<InfinitPostList />);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith("/api/posts?page=1&limit=9");
  });

  it("initialPosts 가 limit(9) 미만이면 더 불러올 게 없어 추가 fetch 를 하지 않는다", async () => {
    const fetchSpy = okEmpty();
    vi.stubGlobal("fetch", fetchSpy);

    render(<InfinitPostList initialPosts={mkPosts(3)} />);

    expect(screen.getByTestId("post-p0")).toBeInTheDocument();
    // 잠깐 흘려보내도 fetch 는 발생하지 않는다(hasMore=false).
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

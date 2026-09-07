// Making the home page's initial list SSR: given initialPosts loaded on the server (page.tsx), InfinitPostList
// skips the first page's CSR fetch (/api/posts?page=1) and renders at once. Without initialPosts
// it fetches the first page on mount as before (backwards compatible).
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { GetPostType } from "@/types/posts.d";

// Not provided by jsdom - infinite scroll and topmost tracking reference it on mount. A stub whose callback never fires is enough.
class StubIntersectionObserver {
  constructor(_cb: unknown) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);

// PostItem is a minimal stub to isolate render dependencies - this test verifies the fetch contract alone.
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

    // The SSR-injected posts are visible at once, with no skeleton.
    expect(screen.getByTestId("post-p0")).toBeInTheDocument();
    expect(screen.queryByTestId("skeleton")).toBeNull();
    // render flushes useEffect too, so there must be no first-page fetch at this point.
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
    // Letting a moment pass still produces no fetch (hasMore=false).
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

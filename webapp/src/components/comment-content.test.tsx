// CommentContent — markdown 렌더 + 보안 테스트.
// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import CommentContent from "./comment-content";

describe("CommentContent — markdown 렌더", () => {
  it("[text](url) → 새 탭 링크", () => {
    render(<CommentContent content="[구글](https://google.com)" />);
    const a = screen.getByRole("link", { name: "구글" });
    expect(a.getAttribute("href")).toBe("https://google.com");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
  });

  it("raw URL 자동 링크 (gfm autolink)", () => {
    render(<CommentContent content="방문 https://example.com 하세요" />);
    const a = screen.getByRole("link");
    expect(a.getAttribute("href")).toBe("https://example.com");
  });

  it("볼드/이탤릭 인라인 마크업", () => {
    const { container } = render(
      <CommentContent content="**굵게** 그리고 *기울임*" />,
    );
    expect(container.querySelector("strong")?.textContent).toBe("굵게");
    expect(container.querySelector("em")?.textContent).toBe("기울임");
  });

  it("단일 줄바꿈 → <br> (remark-breaks)", () => {
    const { container } = render(<CommentContent content={"첫 줄\n둘째 줄"} />);
    expect(container.querySelector("br")).toBeTruthy();
  });

  it("보안 — javascript: URL 차단", () => {
    render(<CommentContent content="[클릭](javascript:alert(1))" />);
    const a = screen.queryByRole("link");
    // react-markdown 기본 urlTransform 이 위험 스킴을 제거.
    if (a) expect(a.getAttribute("href") ?? "").not.toContain("javascript:");
  });

  it("보안 — raw HTML 은 실행되지 않고 텍스트 처리", () => {
    const { container } = render(
      <CommentContent content={'<img src=x onerror=alert(1)>'} />,
    );
    // onerror 가 달린 실제 img 가 생성되지 않아야 함.
    const imgs = container.querySelectorAll("img[onerror]");
    expect(imgs.length).toBe(0);
  });
});

// PrivateLockIcon — 비공개 표시용 잠긴 자물쇠(뷰 제목·목록 제목 공용).
// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrivateLockIcon } from "./private-lock-icon";

describe("PrivateLockIcon", () => {
  it("aria-label='비공개' 인 svg 를 렌더", () => {
    render(<PrivateLockIcon />);
    const el = screen.getByRole("img", { name: "비공개" });
    expect(el.tagName.toLowerCase()).toBe("svg");
  });

  it("className 패스스루(크기·색 오버라이드)", () => {
    const { container } = render(<PrivateLockIcon className="h-5 w-5 text-red-500" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("text-red-500");
    expect(svg?.getAttribute("class")).toContain("h-5");
  });

  it("네이티브 title(호버 툴팁)은 없음", () => {
    const { container } = render(<PrivateLockIcon />);
    expect(container.querySelector("svg > title")).toBeNull();
  });
});

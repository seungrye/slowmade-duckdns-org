// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Navbar from "./navbar";

vi.mock("next-auth/react", () => ({ useSession: vi.fn(), signOut: vi.fn() }));
const pathnameMock = vi.fn<() => string>(() => "/");
vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock() }));

import { useSession } from "next-auth/react";

/**
 * 서버 상태를 게임 메뉴 **바로 아래 평탄한 항목**으로 (#316).
 *
 * 예전엔 "에테르니아의 추락" 하위에 묻혀 있었다. 그런데 서버 상태는 특정 게임의 것이
 * 아니라 로컬 LLM·서버 전반이라 그 자리가 맞지 않는다.
 *
 * JSX 는 안 고친다. `gameLinks` 데이터만 바꾼다 — 하위가 하나뿐인 묶음은 이름 자체가
 * 링크가 되는 패턴(#51)이 이미 있어서, 하위 하나짜리 묶음으로 두면 평탄한 항목이 된다.
 */
const 세션 = (opts: { 로그인: boolean; owner?: boolean }) =>
  vi.mocked(useSession).mockReturnValue(
    opts.로그인
      ? ({ data: { user: { name: "테스터", isOwner: opts.owner } }, status: "authenticated", update: vi.fn() } as never)
      : ({ data: null, status: "unauthenticated", update: vi.fn() } as never),
  );

describe("Navbar — 서버 상태는 게임 메뉴 바로 아래 (#316)", () => {
  beforeEach(() => pathnameMock.mockReturnValue("/"));

  it("owner: 게임 메뉴를 열면 서버 상태가 바로 링크로 보인다 — 하위를 또 펼치지 않는다", () => {
    세션({ 로그인: true, owner: true });
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText("게임 메뉴"));

    // 펼침 토글이 아니라 링크여야 한다. 헛클릭 한 번을 없애는 것이 이 이슈의 목적이다.
    const link = screen.getByRole("link", { name: /서버 상태/ });
    expect(link.getAttribute("href")).toBe("/scenes/status");
  });

  it("owner: 에테르니아 하위에는 더 이상 없다", () => {
    세션({ 로그인: true, owner: true });
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText("게임 메뉴"));
    fireEvent.click(screen.getByLabelText("에테르니아의 추락 하위 메뉴"));

    const 에테르니아하위 = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(에테르니아하위).toContain("/scenes");            // 씬은 그대로 있고
    expect(에테르니아하위.filter((h) => h === "/scenes/status")).toHaveLength(1); // 서버 상태는 한 곳뿐
  });

  it("로그인했지만 owner 가 아니면 안 보인다", () => {
    세션({ 로그인: true, owner: false });
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText("게임 메뉴"));
    expect(screen.queryByRole("link", { name: /서버 상태/ })).toBeNull();
  });

  it("비로그인이면 안 보인다", () => {
    세션({ 로그인: false });
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText("게임 메뉴"));
    expect(screen.queryByRole("link", { name: /서버 상태/ })).toBeNull();
  });

  it("에테르니아·고전 게임 묶음은 그대로다 — 옮기다 다른 것을 건드리지 않는다", () => {
    세션({ 로그인: true, owner: true });
    render(<Navbar />);
    fireEvent.click(screen.getByLabelText("게임 메뉴"));
    expect(screen.getByLabelText("에테르니아의 추락 하위 메뉴")).toBeTruthy();
    expect(screen.getByRole("link", { name: /고전 게임/ })).toBeTruthy();
  });
});

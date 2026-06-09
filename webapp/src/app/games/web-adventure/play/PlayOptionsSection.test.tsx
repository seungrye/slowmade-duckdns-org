// #351/v3 — PlayOptionsSection UI 테스트.
// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import PlayOptionsSection from "./PlayOptionsSection";
import {
  getSkipVisitedEnabled,
  getTypewriterEnabled,
  markSceneVisited,
} from "@/lib/web-adventure/play/typewriter-options";

beforeEach(() => {
  window.localStorage.clear();
});

describe("PlayOptionsSection", () => {
  it("기본 상태 — 타이프라이터 ON, 방문 skip OFF", () => {
    render(<PlayOptionsSection />);
    const tw = screen.getByTestId("opt-typewriter-switch");
    const sk = screen.getByTestId("opt-skip-visited-switch");
    expect(tw.getAttribute("data-checked")).toBe("true");
    expect(sk.getAttribute("data-checked")).toBe("false");
  });

  it("타이프라이터 토글 OFF → localStorage 반영 + UI 동기화", () => {
    render(<PlayOptionsSection />);
    const sw = screen.getByTestId("opt-typewriter-switch");
    act(() => { sw.click(); });
    expect(getTypewriterEnabled()).toBe(false);
    expect(sw.getAttribute("data-checked")).toBe("false");
    // 다시 ON
    act(() => { sw.click(); });
    expect(getTypewriterEnabled()).toBe(true);
    expect(sw.getAttribute("data-checked")).toBe("true");
  });

  it("방문 skip 토글 ON → localStorage 반영", () => {
    render(<PlayOptionsSection />);
    const sw = screen.getByTestId("opt-skip-visited-switch");
    act(() => { sw.click(); });
    expect(getSkipVisitedEnabled()).toBe(true);
    expect(sw.getAttribute("data-checked")).toBe("true");
  });

  it("방문 카운트 표시 — 마운트 시점 값", () => {
    markSceneVisited("a");
    markSceneVisited("b");
    markSceneVisited("c");
    render(<PlayOptionsSection />);
    expect(screen.getByText(/3 씬 방문/)).toBeTruthy();
  });
});

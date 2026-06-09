// #351/v3 — typewriter-options 단위 테스트.
// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";
import {
  getTypewriterEnabled,
  setTypewriterEnabled,
  getSkipVisitedEnabled,
  setSkipVisitedEnabled,
  isSceneVisited,
  markSceneVisited,
  clearVisitedScenes,
  getVisitedScenes,
} from "./typewriter-options";

beforeEach(() => {
  window.localStorage.clear();
});

describe("typewriter-options — 타이프라이터 토글", () => {
  it("기본값 = ON (true)", () => {
    expect(getTypewriterEnabled()).toBe(true);
  });

  it("OFF 설정 후 false", () => {
    setTypewriterEnabled(false);
    expect(getTypewriterEnabled()).toBe(false);
    expect(window.localStorage.getItem("web-adventure:typewriter")).toBe("off");
  });

  it("OFF → ON 복원 시 키 제거 (기본값 회복)", () => {
    setTypewriterEnabled(false);
    setTypewriterEnabled(true);
    expect(getTypewriterEnabled()).toBe(true);
    expect(window.localStorage.getItem("web-adventure:typewriter")).toBe(null);
  });
});

describe("typewriter-options — 방문 자동 skip 토글", () => {
  it("기본값 = OFF (false)", () => {
    expect(getSkipVisitedEnabled()).toBe(false);
  });

  it("ON 설정 후 true", () => {
    setSkipVisitedEnabled(true);
    expect(getSkipVisitedEnabled()).toBe(true);
    expect(window.localStorage.getItem("web-adventure:typewriter-skip-visited")).toBe("on");
  });

  it("ON → OFF 복원 시 키 제거", () => {
    setSkipVisitedEnabled(true);
    setSkipVisitedEnabled(false);
    expect(getSkipVisitedEnabled()).toBe(false);
    expect(window.localStorage.getItem("web-adventure:typewriter-skip-visited")).toBe(null);
  });
});

describe("typewriter-options — 방문 씬 기록", () => {
  it("기본은 빈 Set + isSceneVisited(any) === false", () => {
    expect(getVisitedScenes().size).toBe(0);
    expect(isSceneVisited("any")).toBe(false);
  });

  it("markSceneVisited 후 isSceneVisited === true", () => {
    markSceneVisited("scene_a");
    expect(isSceneVisited("scene_a")).toBe(true);
    expect(isSceneVisited("scene_b")).toBe(false);
  });

  it("중복 mark — 멱등 (Set size 동일)", () => {
    markSceneVisited("dup");
    markSceneVisited("dup");
    expect(getVisitedScenes().size).toBe(1);
  });

  it("clearVisitedScenes — 모두 초기화", () => {
    markSceneVisited("a");
    markSceneVisited("b");
    clearVisitedScenes();
    expect(getVisitedScenes().size).toBe(0);
  });

  it("기존 JSON 손상 시 안전하게 빈 Set", () => {
    window.localStorage.setItem("web-adventure:visited-scenes", "{not-json");
    expect(getVisitedScenes().size).toBe(0);
    // 손상된 기록 위 mark 정상 동작.
    markSceneVisited("recover");
    expect(isSceneVisited("recover")).toBe(true);
  });

  it("문자열 아닌 항목 필터링", () => {
    window.localStorage.setItem(
      "web-adventure:visited-scenes",
      JSON.stringify(["a", 1, null, "b"]),
    );
    const v = getVisitedScenes();
    expect(v.has("a")).toBe(true);
    expect(v.has("b")).toBe(true);
    expect(v.size).toBe(2);
  });
});

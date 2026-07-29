import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// index.html 의 <body> 마크업(스크립트 제외)을 jsdom 에 심고 main.js 를 import 해 엔진을 구동한다.
const html = readFileSync(resolve(import.meta.dirname, "../index.html"), "utf8");
const bodyInner = html
  .match(/<body[^>]*>([\s\S]*?)<\/body>/i)[1]
  .replace(/<script[\s\S]*?<\/script>/gi, "");

function mountApp() {
  document.body.className = "app";
  document.body.innerHTML = bodyInner;
}
function startGame() {
  document.getElementById("title").click(); // 타이틀 탭 → 게임 시작
}
// 선택지는 '항상 마지막(=plain 경로)'을 눌러 확률판정/조건부 타이머 없이 결정적으로 엔딩까지 진행.
function driveToEnding(maxSteps = 100) {
  const log = document.getElementById("log");
  for (let i = 0; i < maxSteps; i++) {
    if (document.querySelector(".ending")) return true;
    const choices = document.querySelectorAll(".choices .choice:not(.locked)");
    if (choices.length) choices[choices.length - 1].click();
    else log.click(); // 텍스트/삽화 진행
  }
  return !!document.querySelector(".ending");
}

describe("eternia 엔진", () => {
  beforeEach(() => {
    vi.resetModules();
    // jsdom: matchMedia 스텁 (reduce-motion=true → 타이핑 즉시완료·동기·결정적)
    window.matchMedia = () => ({
      matches: true,
      addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {},
    });
    document.body.innerHTML = "";
  });

  it("타이틀 화면이 먼저 뜨고, 탭해야 게임이 시작된다", async () => {
    mountApp();
    await import("../src/main.js");
    const title = document.getElementById("title");
    // 시작 전: 타이틀 보임, 본문 비어 있음
    expect(title.classList.contains("hidden")).toBe(false);
    expect(document.querySelectorAll("#log .blk").length).toBe(0);
    // 타이틀 탭 → 숨김 + 첫 씬 렌더
    startGame();
    expect(title.classList.contains("hidden")).toBe(true);
    expect(document.querySelectorAll("#log .blk").length).toBeGreaterThan(0);
  });

  it("엔딩 도달 후 본문을 여러 번 탭해도 엔딩이 중복 출력되지 않는다", async () => {
    mountApp();
    await import("../src/main.js");
    startGame();

    expect(driveToEnding()).toBe(true);
    expect(document.querySelectorAll(".ending").length).toBe(1);

    const log = document.getElementById("log");
    const blocksAtEnding = document.querySelectorAll("#log .blk").length;
    for (let i = 0; i < 6; i++) log.click(); // 엔딩 후 본문 탭 연타

    // 버그였다면 탭마다 엔딩 카드가 늘어난다 → 여전히 1, 블록 수도 그대로여야 한다.
    expect(document.querySelectorAll(".ending").length).toBe(1);
    expect(document.querySelectorAll("#log .blk").length).toBe(blocksAtEnding);
  });
});

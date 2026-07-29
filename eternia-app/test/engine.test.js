import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// index.html 의 <body> 마크업(스크립트 제외)을 jsdom 에 심고 main.js 를 import 해 엔진을 구동한다.
// 콘텐츠는 사이트 content/v1 fetch 이므로 global fetch 를 스텁해 결정적으로 씬을 주입.
const html = readFileSync(resolve(import.meta.dirname, "../index.html"), "utf8");
const bodyInner = html
  .match(/<body[^>]*>([\s\S]*?)<\/body>/i)[1]
  .replace(/<script[\s\S]*?<\/script>/gi, "");

// 결정적 미니 씬 그래프 (start=kael_infirmary → hall → fin(엔딩)). plain 선택지만 사용.
const MOCK_SCENES = [
  {
    id: "kael_infirmary",
    title: "의무동",
    onEnter: { setVars: { who: "카엘" } },
    body: ["희미한 빛 속에서 {{who}}, 너는 눈을 뜬다.", '"정신이 드나?"'],
    choices: [{ kind: "plain", id: "go", label: "[계속] 복도로", to: "hall" }],
  },
  {
    id: "hall",
    title: "복도",
    body: ["복도는 비어 있다."],
    choices: [{ kind: "plain", id: "end", label: "출구로", to: "fin" }],
  },
  {
    id: "fin",
    title: "탈출",
    body: ["너는 걸어 나갔다."],
    isEnding: true,
    endingId: "harmony",
    choices: [],
  },
];

function mountApp() {
  document.body.className = "app";
  document.body.innerHTML = bodyInner;
}
function startGame() {
  document.getElementById("title").click(); // 타이틀 탭 → boot(fetch)
}
async function waitFor(pred, { timeout = 1000, interval = 5 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return pred();
}
// 선택지는 '마지막(=plain 경로)'을 눌러 결정적으로 엔딩까지 진행. 없으면 log 탭으로 문단 진행.
function driveToEnding(maxSteps = 100) {
  const log = document.getElementById("log");
  for (let i = 0; i < maxSteps; i++) {
    if (document.querySelector(".ending")) return true;
    const choices = document.querySelectorAll(".choices .choice:not(.locked)");
    if (choices.length) choices[choices.length - 1].click();
    else log.click();
  }
  return !!document.querySelector(".ending");
}

describe("eternia 엔진 (사이트 계약 소비)", () => {
  beforeEach(() => {
    vi.resetModules();
    // jsdom: matchMedia 스텁 (reduce-motion=true → 타이핑 즉시완료·결정적)
    window.matchMedia = () => ({
      matches: true,
      addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {},
    });
    // content/v1 fetch 스텁 — MOCK_SCENES 반환
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { scenes: MOCK_SCENES } }),
    });
    document.body.innerHTML = "";
  });

  it("타이틀 → 탭하면 fetch한 씬이 렌더된다 ({{변수}} 치환 포함)", async () => {
    mountApp();
    await import("../src/main.js");
    const title = document.getElementById("title");
    // 시작 전: 타이틀 보임, 본문 비어 있음
    expect(title.classList.contains("hidden")).toBe(false);
    expect(document.querySelectorAll("#log .blk").length).toBe(0);
    // 탭 → 타이틀 숨김 + boot(fetch)
    startGame();
    expect(title.classList.contains("hidden")).toBe(true);
    // 씬 제목(의무동)과 본문 {{who}}→카엘 치환이 렌더될 때까지 대기
    await waitFor(() => document.querySelector("#log")?.textContent.includes("카엘"));
    const text = document.getElementById("log").textContent;
    expect(text).toContain("의무동");
    expect(text).toContain("카엘");
    expect(text).not.toContain("{{who}}");
  });

  it("plain 선택지로 진행해 엔딩 카드에 도달하고, 재탭해도 중복되지 않는다", async () => {
    mountApp();
    await import("../src/main.js");
    startGame();
    await waitFor(() => document.querySelector(".stitle")); // 씬 헤더 = fetch 완료·씬 진입(로딩 .p 아님)

    expect(driveToEnding()).toBe(true);
    expect(document.querySelectorAll(".ending").length).toBe(1);

    const log = document.getElementById("log");
    const blocksAtEnding = document.querySelectorAll("#log .blk").length;
    for (let i = 0; i < 6; i++) log.click(); // 엔딩 후 본문 탭 연타

    expect(document.querySelectorAll(".ending").length).toBe(1);
    expect(document.querySelectorAll("#log .blk").length).toBe(blocksAtEnding);
  });

  it("fetch 실패 시 에러 안내를 보여준다", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network"));
    mountApp();
    await import("../src/main.js");
    startGame();
    // fetchScenes 재시도(backoff 500+1500ms) 후 실패하므로 넉넉히 대기
    await waitFor(() => document.getElementById("log").textContent.includes("불러오지 못"), { timeout: 3500 });
    expect(document.getElementById("log").textContent).toContain("불러오지 못");
  });
});

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
function startGame(opts) {
  document.getElementById("title").click(); // 타이틀 탭 → STEP1(주인공)
  const p = (opts && opts.protagonist) || "kael";
  document.querySelector('.cr-prota[data-p="' + p + '"]').click(); // 주인공 선택 → STEP2(성흔)
  if (opts && opts.ability) document.querySelector('.cr-abil[data-a="' + opts.ability + '"]').click();
  document.getElementById("cr-start").click(); // 시작 → boot(fetch)
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
    // 엔딩 재시도 큐(#61)가 localStorage 에 남아 다음 테스트 시작 시 재전송되면
    // app-end-run 호출 수가 어긋난다. 테스트마다 비운다.
    try { window.localStorage.clear(); } catch { /* 저장소 없음 */ }
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

  it("타이틀 → 주인공 선택 → (전환) 성흔 선택 2단계 → fetch한 씬 렌더 ({{변수}} 치환)", async () => {
    mountApp();
    await import("../src/main.js");
    const title = document.getElementById("title");
    expect(title.classList.contains("hidden")).toBe(false);
    // 탭 → STEP1: 주인공 3 (성흔은 아직 없음)
    title.click();
    expect(document.querySelector("#creator")).toBeTruthy();
    expect(document.querySelectorAll(".cr-prota").length).toBe(3);
    expect(document.querySelectorAll(".cr-abil").length).toBe(0);
    expect(document.getElementById("cr-start")).toBeNull();
    // 주인공 선택 → STEP2 전환: 성흔 4 + 시작 버튼 등장, 주인공 카드는 사라짐
    document.querySelector('.cr-prota[data-p="kael"]').click();
    expect(document.querySelectorAll(".cr-prota").length).toBe(0);
    expect(document.querySelectorAll(".cr-abil").length).toBe(4);
    expect(document.getElementById("cr-start")).toBeTruthy();
    // 시작 → boot(fetch)
    document.getElementById("cr-start").click();
    await waitFor(() => document.querySelector("#log")?.textContent.includes("카엘"));
    const text = document.getElementById("log").textContent;
    expect(text).toContain("의무동");
    expect(text).toContain("카엘");
    expect(text).not.toContain("{{who}}");
    expect(document.querySelector(".nameplate").textContent).toContain("카엘");
  });

  it("스탯 클릭 시 앵커 툴팁(.stat-tip)으로 표시하고, 다른 곳 탭 시 닫힌다", async () => {
    mountApp();
    await import("../src/main.js");
    // 상태바 스탯은 초기 렌더됨(타이틀 화면에서도)
    const intStat = document.querySelector('.sstat[data-stat="int"]');
    expect(intStat).toBeTruthy();
    intStat.click();
    const tip = document.querySelector(".stat-tip");
    expect(tip).toBeTruthy();
    expect(tip.textContent).toContain("지능"); // STAT_KO.int
    // 다른 곳(로그) 탭 → 툴팁 닫힘
    document.getElementById("log").click();
    expect(document.querySelector(".stat-tip")).toBeNull();
  });

  it("성흔 단계에서 '주인공 다시'로 STEP1 복귀", async () => {
    mountApp();
    await import("../src/main.js");
    document.getElementById("title").click();
    document.querySelector('.cr-prota[data-p="rin"]').click(); // → STEP2
    expect(document.querySelectorAll(".cr-abil").length).toBe(4);
    document.getElementById("cr-back").click(); // ← 주인공 다시
    expect(document.querySelectorAll(".cr-prota").length).toBe(3);
    expect(document.querySelectorAll(".cr-abil").length).toBe(0);
  });

  it("주인공 선택(린)이 해당 시작씬으로 진입 + 네임플레이트 갱신", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: true, data: { scenes: [{ id: "rin_harbor", title: "검은 연기의 항만", body: ["린의 수사가 시작된다."], choices: [] }] } }),
    });
    mountApp();
    await import("../src/main.js");
    startGame({ protagonist: "rin" });
    await waitFor(() => document.querySelector(".stitle"));
    expect(document.getElementById("log").textContent).toContain("항만");
    expect(document.querySelector(".nameplate").textContent).toContain("린");
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

  // 임의의 씬 셋으로 부팅하는 헬퍼
  async function boot(scenes) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: true, data: { scenes } }),
    });
    mountApp();
    await import("../src/main.js");
    startGame();
    await waitFor(() => document.querySelector(".stitle") || document.querySelector(".ending"));
  }

  it("onEnter.stigmaDelta 로 침식100 도달 시 자동 석화(petrification) 엔딩", async () => {
    await boot([
      { id: "kael_infirmary", title: "시작", body: ["b"], choices: [{ kind: "plain", id: "g", label: "간다", to: "doom" }] },
      { id: "doom", title: "심연", onEnter: { stigmaDelta: 100 }, body: ["돌이 된다"], choices: [] },
    ]);
    // 첫 씬 진행 → doom 진입 시 침식 100 → 즉시 석화 엔딩(본문 미표시)
    driveToEnding();
    const t = document.getElementById("log").textContent;
    expect(document.querySelectorAll(".ending").length).toBe(1);
    expect(t).toContain("petrification");
    expect(t).toContain("석화");
  });

  // 앱에서 sylvan_bond 엔딩 뒤 '다시 플레이' 로 이어서 본 석화 엔딩이 서버에 도달하지
  // 않은 사례. restart() 가 endRunSent 를 리셋하므로 두 번째도 전송돼야 한다.
  it("다시 플레이 후 두 번째 엔딩(석화)도 app-end-run 으로 전송", async () => {
    vi.stubEnv("VITE_APP_KEY", "test-key"); // 키가 없으면 submitAppEndRun 이 즉시 return
    const scenes = [
      { id: "kael_infirmary", title: "시작", body: ["b"], choices: [{ kind: "plain", id: "g", label: "간다", to: "doom" }] },
      { id: "doom", title: "심연", onEnter: { stigmaDelta: 100 }, body: ["돌이 된다"], choices: [] },
    ];
    const endRunCalls = () =>
      globalThis.fetch.mock.calls.filter((c) => String(c[0]).includes("app-end-run"));

    await boot(scenes);
    driveToEnding();
    await waitFor(() => endRunCalls().length >= 1);
    expect(endRunCalls().length).toBe(1);

    // 엔딩 카드 → 다시 플레이(restart) → 캐릭터 생성부터 재시작
    document.getElementById("againBtn").click();
    document.querySelector('.cr-prota[data-p="kael"]').click();
    document.getElementById("cr-start").click();
    await waitFor(() => document.querySelector(".stitle") || document.querySelector(".ending"));

    driveToEnding();
    await waitFor(() => endRunCalls().length >= 2, { timeout: 2000 });
    expect(endRunCalls().length).toBe(2);

    vi.unstubAllEnvs();
  });

  it("onEnter.hpDelta 가 HP 를 깎는다(카엘 maxHp 120)", async () => {
    await boot([
      { id: "kael_infirmary", title: "시작", onEnter: { hpDelta: -20 }, body: ["아프다"], choices: [] },
    ]);
    // Kael maxHp = 100 + con(4)*5 = 120, hpDelta -20 → 100
    expect(document.querySelector(".piprow").getAttribute("title")).toBe("HP 100/120");
  });

  it("conditional 조건 미충족 선택지는 잠긴다(disabled)", async () => {
    await boot([
      {
        id: "kael_infirmary", title: "문", body: ["b"],
        choices: [
          { kind: "conditional", id: "c", label: "금서를 읽는다", condition: { kind: "flag", key: "hasBook" }, to: "x" },
          { kind: "plain", id: "p", label: "지나간다", to: "x" },
        ],
      },
      { id: "x", title: "끝", body: ["끝"], isEnding: true, endingId: "fall", choices: [] },
    ]);
    // 첫 문단 넘겨 선택지 노출
    document.getElementById("log").click();
    await waitFor(() => document.querySelector(".choices"));
    const locked = document.querySelector(".choice.locked");
    expect(locked).toBeTruthy();
    expect(locked.disabled).toBe(true);
  });

  it("probability 선택 → 굴림 카드가 뜬다(성공/실패 결정적)", async () => {
    // reduce-motion 에서 roll=11. stat int7 + 11 = 18. 난이도 12 → 성공.
    await boot([
      {
        id: "kael_infirmary", title: "도전", body: ["b"],
        choices: [{ kind: "probability", id: "r", label: "뛴다", stat: "int", difficulty: 12, onSuccess: "win", onFailure: "lose" }],
      },
      { id: "win", title: "성공씬", body: ["해냈다"], isEnding: true, endingId: "ascension", choices: [] },
      { id: "lose", title: "실패씬", body: ["놓쳤다"], isEnding: true, endingId: "fall", choices: [] },
    ]);
    document.getElementById("log").click();
    await waitFor(() => document.querySelector(".choices .choice"));
    document.querySelector(".choices .choice").click();
    await waitFor(() => document.querySelector(".rollcard"));
    expect(document.querySelector(".rollcard.ok")).toBeTruthy(); // 성공
    await waitFor(() => document.getElementById("log").textContent.includes("해냈다")); // win 씬 진입(150ms 후)
    driveToEnding(); // win 본문 넘겨 엔딩 카드까지
    expect(document.querySelectorAll(".ending").length).toBe(1);
    expect(document.getElementById("log").textContent).toContain("ascension");
  });

  it("선택지 클릭이 로그 탭으로 오인돼 선택지가 중복 출력되지 않는다 (#5)", async () => {
    await boot([
      { id: "kael_infirmary", title: "도전", body: ["b"], choices: [{ kind: "probability", id: "r", label: "뛴다", stat: "int", difficulty: 5, onSuccess: "win", onFailure: "lose" }] },
      { id: "win", title: "성공", body: ["ok"], isEnding: true, endingId: "ascension", choices: [] },
      { id: "lose", title: "실패", body: ["no"], isEnding: true, endingId: "fall", choices: [] },
    ]);
    document.getElementById("log").click(); // 본문 넘겨 선택지 노출
    await waitFor(() => document.querySelector(".choices .choice"));
    expect(document.querySelectorAll(".choices").length).toBe(1);
    document.querySelector(".choices .choice").click(); // 확률 선택
    // 판정 카드는 뜨되, 선택지가 다시 출력되면 안 됨(버그 시 버블된 log-click → afterBody → emitChoices).
    expect(document.querySelector(".rollcard")).toBeTruthy();
    expect(document.querySelectorAll(".choices").length).toBe(0);
  });

  it("Scene.illustration 을 삽화 이미지로 렌더", async () => {
    await boot([{ id: "kael_infirmary", title: "의무동", illustration: "https://cdn.test/inf.png", body: ["b"], choices: [] }]);
    const img = document.querySelector("#log .fig img.illust");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("https://cdn.test/inf.png");
  });

  it("<<img url impact>> 를 임팩트 삽화로 렌더", async () => {
    await boot([{ id: "kael_infirmary", title: "컷", body: ["번쩍 <<img https://cdn.test/hall.png impact>>"], choices: [] }]);
    const fig = document.querySelector("#log .fig.impact img.illust");
    expect(fig).toBeTruthy();
    expect(fig.getAttribute("src")).toBe("https://cdn.test/hall.png");
  });

  it("<<fx flash>> 가 스테이지 화면효과 오버레이를 발동", async () => {
    await boot([{ id: "kael_infirmary", title: "섬광", body: ["번쩍 <<fx flash>>"], choices: [] }]);
    expect(document.querySelector("#stage .fx-ov[data-fx='flash']")).toBeTruthy();
  });

  // globalThis.Audio 를 스텁해 생성된 오디오 엘리먼트를 관찰
  function stubAudio() {
    const created = [];
    globalThis.Audio = vi.fn().mockImplementation((src) => {
      const el = { src, play: vi.fn(), pause: vi.fn(), loop: false, volume: 1, currentTime: 0 };
      created.push(el);
      return el;
    });
    return created;
  }

  it("Scene.bgm 진입 시 BGM 재생(loop/volume)", async () => {
    const created = stubAudio();
    await boot([{ id: "kael_infirmary", title: "음악", bgm: { src: "https://cdn.test/theme.mp3", loop: true, volume: 0.5 }, body: ["b"], choices: [] }]);
    const bgm = created.find((e) => e.src === "https://cdn.test/theme.mp3");
    expect(bgm).toBeTruthy();
    expect(bgm.loop).toBe(true);
    expect(bgm.volume).toBe(0.5);
    expect(bgm.play).toHaveBeenCalled();
  });

  it("<<sfx>> 디렉티브가 효과음 재생", async () => {
    const created = stubAudio();
    await boot([{ id: "kael_infirmary", title: "소리", body: ["칼 <<sfx https://cdn.test/clash.mp3 0.6>>"], choices: [] }]);
    const sfx = created.find((e) => e.src === "https://cdn.test/clash.mp3");
    expect(sfx).toBeTruthy();
    expect(sfx.volume).toBe(0.6);
    expect(sfx.play).toHaveBeenCalled();
  });
});

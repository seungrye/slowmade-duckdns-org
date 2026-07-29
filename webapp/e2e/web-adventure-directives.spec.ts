// web-adventure 인라인 디렉티브 전종 — 실 브라우저(Playwright) 검수.
//
// content/v1 API 를 page.route 로 모킹해 "쇼케이스 씬" 하나를 주입한다(DB/시드 불필요).
// 씬 id 를 Kael 시작 씬(kael_infirmary)과 맞춰, CharacterCreator "운명으로 발을 내딛는다"
// 클릭 → START_GAME(onEnter.setVars 병합) → 쇼케이스 씬 렌더 흐름으로 진입.
//
// 검증(실브라우저): {{변수}} 치환 · <<img impact>> 삽화 · <<fx>> 화면효과 오버레이 ·
// <<sfx>>/<<bgm>> 및 디렉티브 텍스트 미노출 · 오디오로 인한 페이지 크래시 없음.
// (fx/오디오의 결정적 단위 검증은 SceneRenderer/audio-bus vitest 에서 이미 커버.)

import { test, expect } from "@playwright/test";

const SHOWCASE_SCENE = {
  id: "kael_infirmary", // Kael 시작 씬 id 와 일치 → 시작 버튼으로 바로 진입
  title: "디렉티브 쇼케이스",
  illustration: "https://example.test/cover.png",
  // 씬 기본 BGM — 진입 시 재생(autoplay 차단돼도 audio-bus 가 삼킴).
  bgm: { src: "https://example.test/theme.mp3", loop: true, volume: 0.5 },
  // {{route}} 치환 소스 — 진입 시 character.variables 로 병합.
  onEnter: { setVars: { route: "정문 초소" } },
  body: [
    "**베일 박사** *(낮은 목소리로)*",
    "\"너는 {{route}}로 스며든다.\"", // {{변수}} 치환
    "<<img https://example.test/hall.png impact>>", // 임팩트 삽화
    "칼이 부딪친다. <<sfx https://example.test/clash.mp3 0.6>>", // 효과음
    "<<bgm pause>>", // BGM 중간 제어(비가시)
    "시야가 어두워진다. <<fx fadeout 5000>>", // 화면효과(오버레이 5s — assert 안정)
  ],
  choices: [
    { kind: "plain", id: "go", label: "[계속] 앞으로 나아간다", to: "kael_infirmary" },
  ],
};

test.describe("web-adventure 인라인 디렉티브 실브라우저 검수", () => {
  test.beforeEach(async ({ page }) => {
    // 본문 즉시 표시(타이프라이터 off) — 디렉티브가 한 번에 발동.
    await page.addInitScript(() => {
      try { localStorage.setItem("web-adventure:typewriter", "off"); } catch {}
    });
    // content API 모킹 — 쇼케이스 씬 1개만 반환(Mongo 불필요).
    await page.route("**/api/web-adventure/content/v1**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { scenes: [SHOWCASE_SCENE] } }),
      });
    });
  });

  test("씬 진입 → {{변수}}·삽화·화면효과 렌더 + 디렉티브 미노출", async ({ page }) => {
    test.setTimeout(120000); // dev(turbopack) 최초 컴파일 여유

    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await page.goto("/games/web-adventure/play", { timeout: 90000 });
    await expect(page.getByText(/너의 운명을 선택하라/)).toBeVisible({ timeout: 60000 });

    // 기본 주인공(Kael)으로 시작 → 쇼케이스 씬 진입.
    await page.getByRole("button", { name: /운명으로 발을 내딛는다/ }).click();

    // 1) {{route}} 치환 — "정문 초소" 가 대사에 렌더.
    await expect(page.getByText(/정문 초소/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/베일 박사/)).toBeVisible();

    // 2) <<img … impact>> — 삽화 이미지가 alt/src 로 렌더.
    const img = page.locator('img[alt="삽화 https://example.test/hall.png"]');
    await expect(img).toHaveAttribute("src", /hall\.png/);

    // 3) <<fx fadeout>> — 화면효과 오버레이 발동(5s 창).
    await expect(page.locator('[data-testid="fx-overlay"][data-fx="fadeout"]')).toBeVisible();

    // 4) 디렉티브·미치환 토큰이 본문에 문자로 새지 않음.
    const bodyText = await page.locator("[data-typewriter-area]").innerText();
    expect(bodyText).not.toContain("<<");
    expect(bodyText).not.toContain("sfx");
    expect(bodyText).not.toContain("fadeout");
    expect(bodyText).not.toContain("{{route}}");

    // 5) 분기 버튼 렌더.
    await expect(page.getByRole("button", { name: /앞으로 나아간다/ })).toBeVisible();

    // 6) 오디오(Scene.bgm/<<sfx>>/<<bgm>>)로 인한 페이지 크래시 없음.
    expect(pageErrors, `pageerror: ${pageErrors.join(" | ")}`).toHaveLength(0);
  });
});

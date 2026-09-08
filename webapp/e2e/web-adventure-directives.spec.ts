// Every web-adventure inline directive - checked in a real browser (Playwright).
//
// The content/v1 API is mocked through page.route to inject a single "showcase scene" (no DB or seed needed).
// The scene id matches Kael's starting scene (kael_infirmary), so clicking CharacterCreator's start button
// leads into START_GAME (merging onEnter.setVars) and the showcase scene's render.
//
// Verified in the real browser: {{variable}} substitution, the <<img impact>> illustration, the <<fx>> screen-effect overlay,
// <<sfx>>/<<bgm>> and directive text not leaking into the body, and no page crash from audio.
// (The deterministic unit checks for fx and audio are already covered by the SceneRenderer and audio-bus vitest tests.)

import { test, expect } from "@playwright/test";

const SHOWCASE_SCENE = {
  id: "kael_infirmary", // Kael 시작 씬 id 와 일치 → 시작 버튼으로 바로 진입
  title: "디렉티브 쇼케이스",
  illustration: "https://example.test/cover.png",
  // The scene's default BGM - played on entry (a blocked autoplay is swallowed by audio-bus).
  bgm: { src: "https://example.test/theme.mp3", loop: true, volume: 0.5 },
  // The source for the {{route}} substitution - merged into character.variables on entry.
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
    // The body shows at once (the typewriter off) - the directives fire together.
    await page.addInitScript(() => {
      try { localStorage.setItem("web-adventure:typewriter", "off"); } catch {}
    });
    // Mocking the content API - returning the one showcase scene (no Mongo needed).
    await page.route("**/api/web-adventure/content/v1**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { scenes: [SHOWCASE_SCENE] } }),
      });
    });
  });

  test("씬 진입 → {{변수}}·삽화·화면효과 렌더 + 디렉티브 미노출", async ({ page }) => {
    test.setTimeout(120000); // room for dev (turbopack) to compile the first time

    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));

    await page.goto("/games/web-adventure/play", { timeout: 90000 });
    await expect(page.getByText(/너의 운명을 선택하라/)).toBeVisible({ timeout: 60000 });

    // Starting as the default protagonist (Kael) -> entering the showcase scene.
    await page.getByRole("button", { name: /운명으로 발을 내딛는다/ }).click();

    // 1) the {{route}} substitution - the location renders in the speech.
    await expect(page.getByText(/정문 초소/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/베일 박사/)).toBeVisible();

    // 2) <<img … impact>> - the illustration image renders with its alt and src.
    const img = page.locator('img[alt="삽화 https://example.test/hall.png"]');
    await expect(img).toHaveAttribute("src", /hall\.png/);

    // 3) <<fx fadeout>> - the screen-effect overlay fires (a 5s window).
    await expect(page.locator('[data-testid="fx-overlay"][data-fx="fadeout"]')).toBeVisible();

    // 4) neither directives nor unsubstituted tokens leak into the body as text.
    const bodyText = await page.locator("[data-typewriter-area]").innerText();
    expect(bodyText).not.toContain("<<");
    expect(bodyText).not.toContain("sfx");
    expect(bodyText).not.toContain("fadeout");
    expect(bodyText).not.toContain("{{route}}");

    // 5) the branch buttons render.
    await expect(page.getByRole("button", { name: /앞으로 나아간다/ })).toBeVisible();

    // 6) no page crash from the audio (Scene.bgm / <<sfx>> / <<bgm>>).
    expect(pageErrors, `pageerror: ${pageErrors.join(" | ")}`).toHaveLength(0);
  });
});

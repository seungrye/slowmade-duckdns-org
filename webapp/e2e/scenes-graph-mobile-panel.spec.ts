// #339 — 모바일 SidePanel fullscreen.
//
// focus=kael_infirmary URL 진입 시 그 노드 자동 selected + SidePanel 자동 open.
// 모바일에서는 SidePanel 이 fullscreen 으로 .react-flow 노드를 덮어 *직접 click* 이
// 불가 — focus URL 의존으로 패널 자동 활성 후 검증.

import { test, expect } from "@playwright/test";

test.describe("/scenes/graph — #339 모바일 패널 fullscreen", () => {
  test("모바일 viewport 시 패널이 네비 제외 화면 차지", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/scenes/graph?focus=kael_infirmary");
    // focus URL effect 가 setSelectedSceneId(focusParam) → SidePanel mount.
    const panel = page.locator("[data-testid='side-panel']");
    await expect(panel).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(400); // slide-in.

    const box = await panel.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(360);
    expect(box!.height).toBeGreaterThan(550);
    expect(box!.y).toBeGreaterThanOrEqual(50);
    expect(box!.y).toBeLessThanOrEqual(80);
  });

  test("모바일 — 닫기 버튼으로 패널 닫힘", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/scenes/graph?focus=kael_infirmary");
    const panel = page.locator("[data-testid='side-panel']");
    await expect(panel).toBeVisible({ timeout: 15000 });
    const closeBtn = page.getByRole("button", { name: /닫기|close/i }).first();
    await closeBtn.click();
    await expect(panel).toBeHidden({ timeout: 5000 });
  });
});

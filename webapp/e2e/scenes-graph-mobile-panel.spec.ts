// #339 - the mobile SidePanel fullscreen.
//
// Entering by the focus=kael_infirmary URL selects that node automatically and opens the SidePanel.
// On mobile the SidePanel covers the .react-flow nodes fullscreen, so *clicking directly* is
// impossible - the panel is activated through the focus URL and then verified.

import { test, expect } from "@playwright/test";

test.describe("/scenes/graph — #339 모바일 패널 fullscreen", () => {
  test("모바일 viewport 시 패널이 네비 제외 화면 차지", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/scenes/graph?focus=kael_infirmary");
    // The focus-URL effect calls setSelectedSceneId(focusParam) -> the SidePanel mounts.
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

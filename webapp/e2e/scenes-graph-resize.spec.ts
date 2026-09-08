// #338 - the e2e for the SidePanel's horizontal resize handle.
import { test, expect } from "@playwright/test";
import { zoomInChart } from "./helpers/zoom-chart";

test.describe("/scenes/graph — #338 SidePanel 가로 리사이즈", () => {
  test("리사이즈 핸들 드래그 → 패널 width 변경", async ({ page }) => {
    // A large enough viewport - sm and up, so it is in right-hand side mode.
    await page.setViewportSize({ width: 1280, height: 800 });
    // Fresh storage - an earlier e2e may have stored a width.
    await page.addInitScript(() => {
      try { localStorage.removeItem("scenes-graph:side-panel-width"); } catch {}
    });
    await page.goto("/scenes/graph?focus=kael_infirmary");
    // The focus-URL effect mounts the SidePanel automatically. No node click is needed (the panel overlays
    // that node and the click is unstable). It waits for the automatic mount plus the camera move
    // (#341, 600ms) to finish.
    const panel = page.locator("[data-testid='side-panel']");
    await expect(panel).toBeVisible({ timeout: 15000 });
    // Waiting for both the slide-in (300ms) and the camera move (600ms).
    await page.waitForTimeout(1200);
    // (No zoom helper needed - the focus URL's zoom of 1.2 applies.)
    void zoomInChart;

    const beforeBox = await panel.boundingBox();
    expect(beforeBox).toBeTruthy();
    const beforeW = beforeBox!.width;

    // The handle - the left edge.
    const handle = page.locator("[data-testid='side-panel-resize']");
    await expect(handle).toBeVisible({ timeout: 5000 });
    const handleBox = await handle.boundingBox();
    expect(handleBox).toBeTruthy();
    const startX = handleBox!.x + handleBox!.width / 2;
    const startY = handleBox!.y + handleBox!.height / 2;

    // Dragging 250px left -> the panel grows by about 250px. A large distance stabilises the measurement.
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 250, startY, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const afterBox = await panel.boundingBox();
    const afterW = afterBox!.width;
    // A change of 50px or more - verifying the drag's effect (that it *works*, rather than its precision).
    expect(afterW).toBeGreaterThan(beforeW + 50);
  });
});

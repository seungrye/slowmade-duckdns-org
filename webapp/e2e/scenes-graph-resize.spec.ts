// #338 — SidePanel 가로 리사이즈 핸들 e2e.
import { test, expect } from "@playwright/test";
import { zoomInChart } from "./helpers/zoom-chart";

test.describe("/scenes/graph — #338 SidePanel 가로 리사이즈", () => {
  test("리사이즈 핸들 드래그 → 패널 width 변경", async ({ page }) => {
    // viewport 충분히 — sm 이상으로 우측 사이드 모드.
    await page.setViewportSize({ width: 1280, height: 800 });
    // fresh storage — 이전 e2e 가 width 저장했을 수 있음.
    await page.addInitScript(() => {
      try { localStorage.removeItem("scenes-graph:side-panel-width"); } catch {}
    });
    await page.goto("/scenes/graph?focus=kael_infirmary");
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 30000 });
    await zoomInChart(page);

    // 노드 클릭 → 패널 mount.
    const node = page.locator(".react-flow__node").first();
    await node.click();
    const panel = page.locator("[data-testid='side-panel']");
    await expect(panel).toBeVisible({ timeout: 10000 });
    // slide-in transition 300ms 완료 대기.
    await page.waitForTimeout(400);

    const beforeBox = await panel.boundingBox();
    expect(beforeBox).toBeTruthy();
    const beforeW = beforeBox!.width;

    // 핸들 — 좌측 가장자리.
    const handle = page.locator("[data-testid='side-panel-resize']");
    await expect(handle).toBeVisible({ timeout: 5000 });
    const handleBox = await handle.boundingBox();
    expect(handleBox).toBeTruthy();
    const startX = handleBox!.x + handleBox!.width / 2;
    const startY = handleBox!.y + handleBox!.height / 2;

    // 좌측으로 150px 드래그 → 패널 ~150 px 더 넓어짐.
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 150, startY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(100);

    const afterBox = await panel.boundingBox();
    const afterW = afterBox!.width;
    expect(afterW).toBeGreaterThan(beforeW + 100);
  });
});

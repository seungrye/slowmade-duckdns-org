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
    // focus URL effect: SidePanel 자동 mount. node click 불필요 (그 노드 위에
    // 패널이 오버레이 되어 click 이 unstable). 패널 자동 mount + 카메라 이동
    // (#341, 600ms) 완료 대기.
    const panel = page.locator("[data-testid='side-panel']");
    await expect(panel).toBeVisible({ timeout: 15000 });
    // slide-in (300ms) + 카메라 이동 (600ms) 모두 완료 대기.
    await page.waitForTimeout(1200);
    // (zoom helper 불필요 — focus URL 의 zoom 1.2 가 적용)
    void zoomInChart;

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

    // 좌측으로 250px 드래그 → 패널 ~250 px 더 넓어짐. 큰 거리로 측정 안정화.
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 250, startY, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const afterBox = await panel.boundingBox();
    const afterW = afterBox!.width;
    // 50 px 이상 변화 — 드래그 효과 검증 (정확도보다 *작동* 검증).
    expect(afterW).toBeGreaterThan(beforeW + 50);
  });
});

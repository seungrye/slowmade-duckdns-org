// #341 — /scenes/[id] → '차트에서 보기' 버튼 → /scenes/graph?focus=<id>
// 클릭 시 그 노드 자동 selected + zoom 1.2 + 패널 자동 오픈.

import { test, expect } from "@playwright/test";
import { zoomInChart } from "./helpers/zoom-chart";

test.describe("/scenes/graph?focus=<id> — #341 외부 focus 진입", () => {
  test("?focus=kael_infirmary → 해당 노드 selected + 패널 자동 오픈", async ({ page }) => {
    await page.goto("/scenes/graph?focus=kael_infirmary");
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 30000 });
    await zoomInChart(page);
    // 노드 mount 대기.
    await expect(page.locator(`[data-graph-node-id="kael_infirmary"]`)).toBeVisible({ timeout: 30000 });
    // setTimeout 400 + setCenter duration 600 — 1.5s 대기로 충분.
    await page.waitForTimeout(1500);

    // 패널 자동 오픈.
    const panel = page.locator("[data-testid='side-panel']");
    await expect(panel).toBeVisible({ timeout: 5000 });
    expect(await panel.getAttribute("data-scene-id")).toBe("kael_infirmary");

    // 노드의 selected 시각 표시 — #337 의 노란 glow (box-shadow #fde047).
    const node = page.locator(`[data-graph-node-id="kael_infirmary"]`);
    const boxShadow = await node.evaluate((el) => (el as HTMLElement).style.boxShadow);
    // yellow-300 = #fde047 = rgb(253, 224, 71). 브라우저 직렬화 시 rgb 형식.
    expect(boxShadow).toMatch(/#fde047|rgb\(\s*253\s*,\s*224\s*,\s*71\s*\)/i);
  });

  test("/scenes/[id] '차트에서 보기' 버튼 — Link href 가 ?focus=<id>", async ({ page }) => {
    await page.goto("/scenes/kael_infirmary");
    const link = page.getByRole("link", { name: /차트에서 보기/ });
    await expect(link).toBeVisible({ timeout: 15000 });
    const href = await link.getAttribute("href");
    expect(href).toContain("/scenes/graph?focus=");
    expect(href).toContain("kael_infirmary");
  });
});

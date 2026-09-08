// #333 - the e2e for the star marking on /scenes/graph's 3 starting-scene nodes.
import { test, expect } from "@playwright/test";
import { zoomInChart } from "./helpers/zoom-chart";

test.describe("/scenes/graph — #333 시작 씬 ⭐ 표시", () => {
  test("kael_infirmary / rin_harbor / solwen_grove 모두 isStart 시각 표시", async ({ page }) => {
    await page.goto("/scenes/graph");
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 30000 });
    await zoomInChart(page);

    for (const id of ["kael_infirmary", "rin_harbor", "solwen_grove"]) {
      const node = page.locator(`[data-graph-node-id="${id}"]`);
      await expect(node).toBeVisible({ timeout: 30000 });
      // With SceneNode's isStart=true the outer div's classes carry ring-violet-500 plus the star.
      const cls = await node.getAttribute("class");
      expect(cls).toMatch(/ring-violet-500/);
      // The star text is the first span inside the node.
      const hasStar = await node.locator("text=⭐").count();
      expect(hasStar).toBeGreaterThanOrEqual(1);
    }
  });

  test("town_square_dawn (옛 잔재) 는 그래프에 없거나 isStart 표시 없음", async ({ page }) => {
    await page.goto("/scenes/graph");
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 30000 });
    await zoomInChart(page);
    const old = page.locator(`[data-graph-node-id="town_square_dawn"]`);
    const cnt = await old.count();
    if (cnt > 0) {
      const cls = await old.getAttribute("class");
      expect(cls ?? "").not.toMatch(/ring-violet-500/);
    } else {
      expect(cnt).toBe(0);
    }
  });
});

// Shared by the graph e2e tests - zooming into the ReactFlow chart.
//
// #345 - with fitView over 69 nodes each node is too small in the viewport. The e2e click and drag
// become unstable -> a 30s timeout. Zooming in enlarges the nodes -> stable.

import type { Page } from "@playwright/test";

export async function zoomInChart(page: Page, times = 4): Promise<void> {
  // ReactFlow zoom in - enlarging the nodes. Zooming too far takes them outside the viewport
  // and they cannot be clicked. 4 steps is about right.
  const zoomIn = page.locator(".react-flow__controls-zoomin");
  for (let i = 0; i < times; i++) {
    await zoomIn.click({ timeout: 5000 }).catch(() => {
      /* 이미 최대 zoom 또는 일시 오류 — 무시 */
    });
    await page.waitForTimeout(100);
  }
  // Waiting for the ReactFlow zoom animation to finish - so the nodes are stable.
  await page.waitForTimeout(500);
}

/**
 * Clicking a node - a boundingBox-based mouse.click, bypassing the outside-viewport and stability checks.
 * locator.click's stability and scrollIntoView often hang on a ReactFlow node carrying a transform,
 * so clicking *the coordinates directly* is stable.
 */
export async function clickNode(page: Page, sceneId: string): Promise<void> {
  const node = page.locator(`[data-graph-node-id="${sceneId}"]`).first();
  const box = await node.boundingBox();
  if (!box) throw new Error(`node boundingBox null: ${sceneId}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}


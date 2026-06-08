// 그래프 e2e 공통 — ReactFlow 차트 zoom in.
//
// #345 — 69 노드 fitView 시 각 노드가 viewport 에 너무 작음. e2e 의 click/drag
// 가 unstable → 30s timeout. zoom in 으로 노드 size 확장 → 안정.

import type { Page } from "@playwright/test";

export async function zoomInChart(page: Page, times = 4): Promise<void> {
  // ReactFlow zoom in — 노드 size 확장. 너무 많이 zoom 하면 노드가 viewport 밖
  // 으로 나가 click 못 함. 4 회가 적당.
  const zoomIn = page.locator(".react-flow__controls-zoomin");
  for (let i = 0; i < times; i++) {
    await zoomIn.click({ timeout: 5000 }).catch(() => {
      /* 이미 최대 zoom 또는 일시 오류 — 무시 */
    });
    await page.waitForTimeout(100);
  }
  // ReactFlow zoom animation 완료 대기 — node stable 확보.
  await page.waitForTimeout(500);
}

/**
 * 노드 click — viewport 밖 / stable 검사 우회를 위해 boundingBox 기반 mouse.click.
 * locator.click 의 stability/scrollIntoView 가 ReactFlow 의 transform 적용 노드
 * 에서 hang 하는 케이스가 잦아 *직접 좌표* 클릭이 안정.
 */
export async function clickNode(page: Page, sceneId: string): Promise<void> {
  const node = page.locator(`[data-graph-node-id="${sceneId}"]`).first();
  const box = await node.boundingBox();
  if (!box) throw new Error(`node boundingBox null: ${sceneId}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}


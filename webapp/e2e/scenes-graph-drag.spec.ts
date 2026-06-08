// #329 — /scenes/graph 노드 드래그 실 브라우저 e2e.
//
// 검증:
//   1. ReactFlow 마운트 + 노드 ≥ 1 렌더.
//   2. 노드 한 개의 *초기 position* (transform: translate(...)) 캡처.
//   3. mouse 드래그 (down → move → up) → 노드의 transform 이 *변경됨*.
//   4. 500ms debounce 후 PUT /api/web-adventure/scenes/{id} 호출 + body.position 확인.

import { test, expect } from "@playwright/test";
import { zoomInChart } from "./helpers/zoom-chart";

// focus=kael_infirmary → 그 노드 중앙 + zoom 1.2 — 69 씬 fitView 후 노드가
// 매우 작아져 drag e2e 가 *옆 노드 위* 로 mouse.move 가는 문제 차단.
const GRAPH_URL = "/scenes/graph?focus=kael_infirmary";

// ReactFlow 노드의 외부 wrapper 는 .react-flow__node 클래스를 갖고
// inline style 의 transform: translate(Xpx, Ypx) 로 위치한다.
async function getNodeTransform(page: import("@playwright/test").Page, sceneId: string): Promise<{ x: number; y: number }> {
  return await page.evaluate((id) => {
    const inner = document.querySelector(`[data-graph-node-id="${id}"]`) as HTMLElement | null;
    if (!inner) throw new Error(`node not found: ${id}`);
    const outer = inner.closest(".react-flow__node") as HTMLElement | null;
    if (!outer) throw new Error(`react-flow__node wrapper not found: ${id}`);
    const tr = outer.style.transform;
    // translate(100px, 200px) 또는 translate3d(100px, 200px, 0px) 패턴.
    const m = tr.match(/translate(?:3d)?\(([-\d.]+)px,\s*([-\d.]+)px(?:,\s*[-\d.]+px)?\)/);
    if (!m) throw new Error(`unexpected transform: ${tr}`);
    return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
  }, sceneId);
}

// viewport 의 inline transform (.react-flow__viewport).
// 캔버스 pan/zoom 시 변화. 노드 드래그 시 변하면 안 됨.
async function getViewportTransform(page: import("@playwright/test").Page): Promise<string> {
  return await page.evaluate(() => {
    const vp = document.querySelector(".react-flow__viewport") as HTMLElement | null;
    return vp?.style.transform ?? "";
  });
}

test.describe("/scenes/graph — #329 노드 드래그 e2e", () => {
  test("#332 드래그 중 viewport transform *그대로* (카메라 jump 차단)", async ({ page }) => {
    await page.goto(GRAPH_URL);
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 30000 });
    await zoomInChart(page);
    const anyNode = page.locator(".react-flow__node").first();
    await expect(anyNode).toBeVisible({ timeout: 30000 });

    const vpBefore = await getViewportTransform(page);

    const box = await anyNode.boundingBox();
    expect(box).toBeTruthy();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 200, cy + 100, { steps: 10 });
    await page.mouse.up();
    // setTimeout 350ms 의 setCenter 가 발화하지 않음을 확인하기 위해 충분히
    // 기다림 (500ms — debounce + 350ms 카메라 효과 모두 지남).
    await page.waitForTimeout(900);

    const vpAfter = await getViewportTransform(page);
    // viewport transform 의 *큰 이동* (≥ 10px) 없음.
    // ReactFlow 의 자체 jiggle (수 px) 은 허용. setCenter 카메라 jump 는 ≥ 50px.
    const parse = (t: string) => {
      const m = t.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
    };
    const a = parse(vpBefore);
    const b = parse(vpAfter);
    expect(Math.abs(b.x - a.x)).toBeLessThan(10);
    expect(Math.abs(b.y - a.y)).toBeLessThan(10);
  });


  test("선택된 한 노드만 이동, 다른 노드는 *그대로* (캔버스 pan 과 구분)", async ({ page }) => {
    await page.goto(GRAPH_URL);
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 30000 });
    await zoomInChart(page);

    // 노드 ≥ 2 — 캔버스 pan 과 *진짜 노드 드래그* 의 구분에 필수.
    // 캔버스 pan 이면 *모든 노드* 의 .react-flow__node transform 이 동시에 변함.
    // 진짜 노드 드래그면 *해당 노드* 만 변함.
    const allNodes = page.locator(".react-flow__node");
    await expect(allNodes.first()).toBeVisible({ timeout: 30000 });
    const count = await allNodes.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const dragId = await allNodes
      .nth(0)
      .locator("[data-graph-node-id]")
      .getAttribute("data-graph-node-id");
    const otherId = await allNodes
      .nth(1)
      .locator("[data-graph-node-id]")
      .getAttribute("data-graph-node-id");
    expect(dragId).toBeTruthy();
    expect(otherId).toBeTruthy();
    expect(dragId).not.toBe(otherId);

    const dragBefore = await getNodeTransform(page, dragId!);
    const otherBefore = await getNodeTransform(page, otherId!);

    // 드래그 노드 중심에서 mousedown → 단계적 move → up.
    const box = await allNodes.nth(0).boundingBox();
    expect(box).toBeTruthy();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy + 50, { steps: 5 });
    await page.mouse.move(cx + 200, cy + 100, { steps: 5 });
    await page.mouse.move(cx + 300, cy + 150, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const dragAfter = await getNodeTransform(page, dragId!);
    const otherAfter = await getNodeTransform(page, otherId!);

    // 드래그한 노드 — transform 의 x/y 가 충분히 변경됨 (20 px 이상).
    const dragDx = Math.abs(dragAfter.x - dragBefore.x);
    const dragDy = Math.abs(dragAfter.y - dragBefore.y);
    expect(dragDx + dragDy).toBeGreaterThan(20);

    // 다른 노드 — transform 변동 거의 없음 (≤ 2 px, 부동소수점 오차 허용).
    // 캔버스 pan 이었으면 dragDx/Dy 만큼 똑같이 변함 — fail.
    const otherDx = Math.abs(otherAfter.x - otherBefore.x);
    const otherDy = Math.abs(otherAfter.y - otherBefore.y);
    expect(otherDx).toBeLessThanOrEqual(2);
    expect(otherDy).toBeLessThanOrEqual(2);
  });

  test("드래그 ≥ 5px → PUT /api/web-adventure/scenes/{id} 호출 + body.position", async ({ page }) => {
    await page.goto(GRAPH_URL);
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 30000 });
    await zoomInChart(page);
    const anyNode = page.locator(".react-flow__node").first();
    await expect(anyNode).toBeVisible({ timeout: 30000 });
    const sceneId = await anyNode
      .locator("[data-graph-node-id]")
      .getAttribute("data-graph-node-id");
    expect(sceneId).toBeTruthy();

    // PUT 요청 캡처.
    const putPromise = page.waitForRequest(
      (req) =>
        req.method() === "PUT" &&
        req.url().includes(`/api/web-adventure/scenes/${encodeURIComponent(sceneId!)}`),
      { timeout: 10000 },
    );

    const box = await anyNode.boundingBox();
    expect(box).toBeTruthy();
    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // 좌측으로 이동 — focus URL 진입 시 우측 SidePanel(384px) 위로 가지 않도록.
    await page.mouse.move(cx - 200, cy + 100, { steps: 10 });
    await page.mouse.up();

    // 500ms debounce 후 PUT.
    const put = await putPromise;
    const postBody = put.postDataJSON() as { position?: { x: number; y: number } };
    expect(postBody.position).toBeDefined();
    expect(typeof postBody.position!.x).toBe("number");
    expect(typeof postBody.position!.y).toBe("number");
  });
});

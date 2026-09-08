// #329 - the real-browser e2e for dragging a node on /scenes/graph.
//
// What is verified:
//   1. ReactFlow mounts and at least 1 node renders.
//   2. one node's *initial position* (transform: translate(...)) is captured.
//   3. a mouse drag (down -> move -> up) -> the node's transform *changes*.
//   4. after the 500ms debounce, PUT /api/web-adventure/scenes/{id} is called and body.position is checked.

import { test, expect } from "@playwright/test";
import { zoomInChart } from "./helpers/zoom-chart";

// focus=kael_infirmary -> that node centred at zoom 1.2 - blocking the problem where, after fitView over 69 scenes,
// the nodes are so small that the drag e2e's mouse.move lands *on the node next door*.
const GRAPH_URL = "/scenes/graph?focus=kael_infirmary";

// A ReactFlow node's outer wrapper carries the .react-flow__node class and is
// positioned by the inline style's transform: translate(Xpx, Ypx).
async function getNodeTransform(page: import("@playwright/test").Page, sceneId: string): Promise<{ x: number; y: number }> {
  return await page.evaluate((id) => {
    const inner = document.querySelector(`[data-graph-node-id="${id}"]`) as HTMLElement | null;
    if (!inner) throw new Error(`node not found: ${id}`);
    const outer = inner.closest(".react-flow__node") as HTMLElement | null;
    if (!outer) throw new Error(`react-flow__node wrapper not found: ${id}`);
    const tr = outer.style.transform;
    // The translate(100px, 200px) or translate3d(100px, 200px, 0px) pattern.
    const m = tr.match(/translate(?:3d)?\(([-\d.]+)px,\s*([-\d.]+)px(?:,\s*[-\d.]+px)?\)/);
    if (!m) throw new Error(`unexpected transform: ${tr}`);
    return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
  }, sceneId);
}

// The viewport's inline transform (.react-flow__viewport).
// It changes when the canvas pans or zooms. It must not change on a node drag.
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
    // It waits long enough to confirm the setCenter in the 350ms setTimeout does not
    // fire (500ms - past both the debounce and the 350ms camera effect).
    await page.waitForTimeout(900);

    const vpAfter = await getViewportTransform(page);
    // No *large movement* (>= 10px) in the viewport transform.
    // ReactFlow's own jiggle (a few px) is allowed. A setCenter camera jump is >= 50px.
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

    // At least 2 nodes - essential to tell a canvas pan from *a real node drag*.
    // On a canvas pan, *every node's* .react-flow__node transform changes together.
    // On a real node drag, only *that node* changes.
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

    // mousedown at the dragged node's centre -> stepwise moves -> up.
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

    // The dragged node - the transform's x/y changed enough (20px or more).
    const dragDx = Math.abs(dragAfter.x - dragBefore.x);
    const dragDy = Math.abs(dragAfter.y - dragBefore.y);
    expect(dragDx + dragDy).toBeGreaterThan(20);

    // The other node - almost no change in the transform (<= 2px, allowing floating-point error).
    // Had it been a canvas pan it would have changed by the same dragDx/Dy - a failure.
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

    // Capturing the PUT request.
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
    // Moving left - so a focus-URL entry does not land on the right-hand SidePanel (384px).
    await page.mouse.move(cx - 200, cy + 100, { steps: 10 });
    await page.mouse.up();

    // The PUT after the 500ms debounce.
    const put = await putPromise;
    const postBody = put.postDataJSON() as { position?: { x: number; y: number } };
    expect(postBody.position).toBeDefined();
    expect(typeof postBody.position!.x).toBe("number");
    expect(typeof postBody.position!.y).toBe("number");
  });
});

// 에디터 툴바 레이아웃 회귀 (#43).
//
// jsdom 에는 레이아웃이 없어(getBoundingClientRect 가 전부 0) 위치·정렬 버그를
// 단위 테스트로는 잡을 수 없다. 실제 브라우저에서 좌표를 재는 것이 유일한 검증이다.
import { test, expect, type Page } from "@playwright/test";

const openWriter = async (page: Page) => {
  await page.goto("/post/write", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[role="toolbar"]');
  await page.waitForTimeout(1000); // 에디터 초기화
};

/** 툴바 세로 중앙 대비 요소 중심의 오프셋(px). 0 이면 정확히 중앙. */
const centerOffset = async (page: Page, selector: string) => {
  const el = (await page.locator(selector).first().boundingBox())!;
  const tb = (await page.locator('[role="toolbar"]').first().boundingBox())!;
  return el.y + el.height / 2 - (tb.y + tb.height / 2);
};

test.describe("에디터 툴바", () => {
  test("표 드롭다운은 표 버튼 아래에 뜬다 (화면 좌상단 아님)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openWriter(page);

    const btn = page.locator('[aria-label="표"]');
    await expect(btn).toBeVisible();
    const b = (await btn.boundingBox())!;

    await btn.click();
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();
    const m = (await menu.boundingBox())!;

    // 앵커(reference) 가 끊기면 floating-ui 가 기준점 없이 (0,0) 에 렌더한다.
    // 정상이면 트리거 바로 아래, 가로로도 인접한 곳에 뜬다.
    expect(m.y).toBeGreaterThan(b.y);
    expect(Math.abs(m.x - b.x)).toBeLessThan(200);
  });

  test("좁은 폭 수식 입력은 링크 입력과 같은 세로 중앙에 온다", async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });

    // 기준: 링크 입력 (툴바 세로 중앙)
    await openWriter(page);
    await page.locator('[aria-label="Link"]').click();
    await expect(page.locator(".tiptap-input").first()).toBeVisible();
    const linkOffset = await centerOffset(page, ".tiptap-input");

    // 대상: 수식 입력
    await openWriter(page);
    await page.locator('[aria-label="수식 삽입"]').click();
    await expect(page.locator(".math-popover-input")).toBeVisible();
    const mathOffset = await centerOffset(page, ".math-popover-input");

    // 버그일 때 수식만 6px 위로 붙었다(alignSelf: flex-start).
    expect(Math.abs(mathOffset - linkOffset)).toBeLessThan(2);
    expect(Math.abs(mathOffset)).toBeLessThan(2);
  });

  test("좁은 폭 수식 입력이 툴바 폭을 넘지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await openWriter(page);

    await page.locator('[aria-label="수식 삽입"]').click();
    await expect(page.locator(".math-popover-input")).toBeVisible();

    // min-width: 18rem(288px) 이 강제되면 툴바가 넘쳐 가로 스크롤이 생겼다.
    const { sw, cw } = await page
      .locator('[role="toolbar"]')
      .first()
      .evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    expect(sw).toBeLessThanOrEqual(cw);
  });
});

// The editor toolbar's layout regression (#43).
//
// jsdom has no layout (getBoundingClientRect returns all zeros), so position and alignment bugs
// cannot be caught in unit tests. Measuring the coordinates in a real browser is the only check.
import { test, expect, type Page } from "@playwright/test";

const openWriter = async (page: Page) => {
  await page.goto("/post/write", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[role="toolbar"]');
  await page.waitForTimeout(1000); // initialising the editor
};

/** The element centre's offset (px) from the toolbar's vertical centre. 0 is exactly centred. */
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

    // With the anchor (reference) broken, floating-ui renders at (0,0) with no reference point.
    // Correctly, it appears just below the trigger and horizontally adjacent to it.
    expect(m.y).toBeGreaterThan(b.y);
    expect(Math.abs(m.x - b.x)).toBeLessThan(200);
  });

  test("좁은 폭 수식 입력은 링크 입력과 같은 세로 중앙에 온다", async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });

    // The reference: the link input (the toolbar's vertical centre)
    await openWriter(page);
    await page.locator('[aria-label="Link"]').click();
    await expect(page.locator(".tiptap-input").first()).toBeVisible();
    const linkOffset = await centerOffset(page, ".tiptap-input");

    // The subject: the formula input
    await openWriter(page);
    await page.locator('[aria-label="수식 삽입"]').click();
    await expect(page.locator(".math-popover-input")).toBeVisible();
    const mathOffset = await centerOffset(page, ".math-popover-input");

    // With the bug, the formula alone sat 6px higher (alignSelf: flex-start).
    expect(Math.abs(mathOffset - linkOffset)).toBeLessThan(2);
    expect(Math.abs(mathOffset)).toBeLessThan(2);
  });

  test("좁은 폭 수식 입력이 툴바 폭을 넘지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await openWriter(page);

    await page.locator('[aria-label="수식 삽입"]').click();
    await expect(page.locator(".math-popover-input")).toBeVisible();

    // Forcing min-width: 18rem (288px) overflowed the toolbar and produced horizontal scrolling.
    const { sw, cw } = await page
      .locator('[role="toolbar"]')
      .first()
      .evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    expect(sw).toBeLessThanOrEqual(cw);
  });
});

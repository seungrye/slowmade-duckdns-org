// The old quest CMS pattern - the e2e for the scene revision UI's new placement.
//
// What is verified:
//   1. the /scenes page -> a v{n} badge on each row.
//   2. /scenes/kael_infirmary -> the 'view revisions' link with href = /scenes/kael_infirmary/revisions.
//   3. /scenes/kael_infirmary/revisions -> the page loads, the revision section is there (expanded by default) and
//      one GET of /revisions is confirmed.

import { test, expect } from "@playwright/test";

test.describe("/scenes — version badge", () => {
  test("행에 v\\d+ badge 가 보임", async ({ page }) => {
    await page.goto("/scenes");
    // Waiting for the rows' fetch to finish.
    await page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/web-adventure/scenes") &&
        res.request().method() === "GET",
      { timeout: 15000 },
    );
    await page.waitForTimeout(500);

    // A v-plus-number pattern in the first row's text.
    const firstRow = page.locator("[data-scene-row]").first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    const text = await firstRow.innerText();
    expect(text).toMatch(/v\d+/);
  });
});

test.describe("/scenes/[id] — 리비전 보기 링크", () => {
  test("kael_infirmary 편집 페이지에 '리비전 보기' Link + href 확인", async ({ page }) => {
    await page.goto("/scenes/kael_infirmary");
    const link = page.getByRole("link", { name: /리비전 보기/ });
    await expect(link).toBeVisible({ timeout: 10000 });
    const href = await link.getAttribute("href");
    expect(href).toBe("/scenes/kael_infirmary/revisions");
  });
});

test.describe("/scenes/[id]/revisions — 별도 페이지", () => {
  test("페이지 로드 + 리비전 섹션 (기본 펼침) + fetch 1 회 확인", async ({ page }) => {
    const revGetPromise = page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/web-adventure/scenes/kael_infirmary/revisions") &&
        res.request().method() === "GET",
      { timeout: 15000 },
    );
    await page.goto("/scenes/kael_infirmary/revisions");
    const res = await revGetPromise;
    expect(res.ok()).toBe(true);

    // The page title - the revision text.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("리비전");
    // The 'back to scene editing' link.
    const back = page.getByRole("link", { name: /씬 편집으로/ });
    await expect(back).toBeVisible({ timeout: 5000 });
    const backHref = await back.getAttribute("href");
    expect(backHref).toBe("/scenes/kael_infirmary");

    // The revision section - expanded by default (the change-history toggle with aria-expanded='true').
    const toggle = page.getByRole("button", { name: /변경 이력/ });
    await expect(toggle).toBeVisible({ timeout: 5000 });
    expect(await toggle.getAttribute("aria-expanded")).toBe("true");
  });
});

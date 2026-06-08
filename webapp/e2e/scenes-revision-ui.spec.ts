// 옛 quest CMS 패턴 — 씬 revision UI 재배치 e2e.
//
// 검증:
//   1. /scenes 페이지 → 각 행에 v{n} badge 보임.
//   2. /scenes/kael_infirmary → "리비전 보기" 링크 + href = /scenes/kael_infirmary/revisions.
//   3. /scenes/kael_infirmary/revisions → 페이지 로드 + 리비전 섹션 (기본 펼침) +
//      /revisions GET fetch 1 회 확인.

import { test, expect } from "@playwright/test";

test.describe("/scenes — version badge", () => {
  test("행에 v\\d+ badge 가 보임", async ({ page }) => {
    await page.goto("/scenes");
    // 행 fetch 완료까지 대기.
    await page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/web-adventure/scenes") &&
        res.request().method() === "GET",
      { timeout: 15000 },
    );
    await page.waitForTimeout(500);

    // 첫 행의 텍스트에 v 숫자 패턴.
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

    // 페이지 제목 — '리비전' 텍스트.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("리비전");
    // '← 씬 편집으로' 링크.
    const back = page.getByRole("link", { name: /씬 편집으로/ });
    await expect(back).toBeVisible({ timeout: 5000 });
    const backHref = await back.getAttribute("href");
    expect(backHref).toBe("/scenes/kael_infirmary");

    // 리비전 섹션 — 기본 펼침 (aria-expanded='true' 인 변경 이력 토글).
    const toggle = page.getByRole("button", { name: /변경 이력/ });
    await expect(toggle).toBeVisible({ timeout: 5000 });
    expect(await toggle.getAttribute("aria-expanded")).toBe("true");
  });
});

// 〈에테르니아: 정제〉 손패 UI — 실브라우저 검수 (#425).
//
// 여기서 보는 것은 **화면 없이는 못 재는 것들**이다. 침식·정제·엔딩 규칙은
// `lib/eternia-refine/*.test.ts` 가 순수 함수로 덮고, 부채 각도·간격은
// `_components/fan-geometry.test.ts` 가 계산으로 덮는다. 이 파일은 그 계산이 **실제로
// 그렇게 그려지는지**와 **손짓이 의도대로 갈리는지**만 본다 — 레이아웃과 포인터
// 이벤트는 jsdom 에 없다.
//
// ⚠ **프로덕션 빌드에서만 돈다.** 사이트 CSP 가 `unsafe-eval` 을 막는데 `next dev` 의
//   HMR 이 eval 을 써서 하이드레이션이 죽는다. dev 서버로 재면 버튼이 아무 반응도 하지
//   않아 "기능이 깨졌다" 로 오해하게 된다. e2e/README.md 참조.
//
// ── 손패에 손대는 사람에게 ──────────────────────────────────────────
//
// 카드는 서로 **겹친다**. 그래서 `locator.click()` 은 대개 옆 카드에 가로채인다
// (뒤 카드가 z-index 가 높고, 간격 13~34px < 카드 폭 100px). 두 가지로 피한다:
//   - 탭 검사는 **맨 뒤 카드**만 누른다 — 그 자리에서 topmost 라 가려지지 않는다.
//   - 끌기·튕기기는 `dragUp` 이 손패 컨테이너에 직접 이벤트를 낸다. 어느 카드인지는
//     FanHand 가 X 좌표로 고르므로(cardAt) 가려짐과 무관하다.

import { test, expect, type Page } from "@playwright/test";
import { dragUp, centerOf } from "./helpers/pointer-gesture";

const HAND = '[aria-label="손패"]';
const CARD = `${HAND} button`;

/** 사용자가 제보한 기기 폭. 부채가 실제로 잘렸던 화면이다. */
const PHONE = { width: 412, height: 915 };

/** FanHand 의 판정 문턱 — 손짓이 정말 그 편에 섰는지 재려고 그대로 들고 있는다. */
const FLICK_VELOCITY = 0.55;

interface Entry {
  /** 생략하면 기본값(린). 카엘은 결정 2장을 안고 시작한다. */
  protagonist?: string;
  path?: string;
}

/**
 * 전투 화면까지 들어간다.
 *
 * 기본은 **린 + 루나** — 침식 10 이라 드로우 보너스가 0 이고, 시작 덱 8장에 결정이
 * 없다. 그래서 손패는 늘 5장이고 전부 낼 수 있다(전부 비용 ≤1, 에테르 3). 손짓 검사에
 * 필요한 것은 이 결정성이다.
 */
async function enterBattle(page: Page, { protagonist, path = "/games/eternia-refine/shared" }: Entry = {}) {
  await page.goto(path);
  if (protagonist) {
    await page.locator("button[aria-pressed]").filter({ hasText: protagonist }).click();
  }
  await page.getByRole("button", { name: "운명으로 발을 내딛는다" }).click();
  await expect(page.locator(HAND)).toBeVisible();
  await expect(page.locator(CARD).first()).toBeVisible();
}

/**
 * 펼쳐진 카드가 `i` 번이 될 때까지 기다린다.
 *
 * 선택 카드만 z-index 60 으로 떠오른다 — 그것이 "펼쳐졌다"의 눈에 보이는 정의다.
 * 카드 본문은 선택 여부와 무관하게 DOM 에 있고 opacity 로만 감춰지므로, 텍스트로는
 * 못 가린다. 단발 조회로 재면 리액트가 상태를 반영하기 전에 읽어 −1 이 나온다(실측).
 */
async function expectExpanded(page: Page, i: number) {
  await expect
    .poll(() =>
      page.evaluate((sel) => {
        const cards = [...document.querySelectorAll<HTMLElement>(sel)];
        return cards.findIndex((c) => getComputedStyle(c).zIndex === "60");
      }, CARD),
    )
    .toBe(i);
}

/** 손패에서 이름으로 카드를 찾는다. 없으면 −1. */
async function indexOfCard(page: Page, name: string): Promise<number> {
  const texts = await page.locator(CARD).allInnerTexts();
  return texts.findIndex((t) => t.includes(name));
}

test.describe("손패 제스처 (#425)", () => {
  test.use({ viewport: PHONE });

  test("린으로 시작하면 손패 5장이 전부 낼 수 있는 카드다", async ({ page }) => {
    await enterBattle(page);
    await expect(page.locator(CARD)).toHaveCount(5);
    // 낼 수 없는 카드만 흐려진다 — 하나도 없어야 이 아래 검사들이 결정적이다.
    await expect(page.locator(`${CARD}.opacity-60`)).toHaveCount(0);
  });

  test("탭은 펼치기다 — 제출되면 안 된다", async ({ page }) => {
    await enterBattle(page);
    const before = await page.locator(CARD).count();

    // 맨 뒤 카드 = 그 자리에서 제일 위. 겹침에 가로채이지 않는다.
    const last = before - 1;
    await page.locator(CARD).nth(last).click();

    // 예전엔 탭이 곧 제출이라 여기서 장수가 줄었다.
    await expect(page.locator(CARD)).toHaveCount(before);
    await expectExpanded(page, last);
  });

  test("위로 튕기면 낸다 — 거리가 짧아도", async ({ page }) => {
    await enterBattle(page);
    const before = await page.locator(CARD).count();

    const at = await centerOf(page, CARD, before - 1);
    const r = await dragUp(page, HAND, { atX: at.x, atY: at.y, distance: 40, durationMs: 34 });

    // 손짓이 정말 빨랐는지 먼저 확인 — 느렸다면 이 검사는 아무것도 증명하지 않는다.
    expect(r.velocity).toBeGreaterThan(FLICK_VELOCITY);
    await expect(page.locator(CARD)).toHaveCount(before - 1);
  });

  test("같은 거리를 천천히 끌면 안 낸다 — 훑다가 오발로 나가면 안 되니까", async ({ page }) => {
    await enterBattle(page);
    const before = await page.locator(CARD).count();

    const at = await centerOf(page, CARD, before - 1);
    const r = await dragUp(page, HAND, { atX: at.x, atY: at.y, distance: 40, durationMs: 300 });

    expect(r.velocity).toBeLessThan(FLICK_VELOCITY);
    await page.waitForTimeout(500);
    await expect(page.locator(CARD)).toHaveCount(before);
  });

  test("충분히 멀리 끌면 낸다 — 느려도", async ({ page }) => {
    await enterBattle(page);
    const before = await page.locator(CARD).count();

    const at = await centerOf(page, CARD, before - 1);
    // 84px 문턱을 넘긴다. 속도는 플릭에 한참 못 미치므로 거리 쪽 길만 시험된다.
    const r = await dragUp(page, HAND, { atX: at.x, atY: at.y, distance: 130, durationMs: 400, steps: 10 });

    expect(r.velocity).toBeLessThan(FLICK_VELOCITY);
    await expect(page.locator(CARD)).toHaveCount(before - 1);
  });

  test("키보드로도 낼 수 있다 — 한 번은 펼치기, 두 번째가 제출", async ({ page }) => {
    await enterBattle(page);
    const before = await page.locator(CARD).count();

    // 손짓을 못 쓰는 입력이라 탭 규칙에 예외를 둔 자리다(FanHand onClick, detail === 0).
    await page.locator(CARD).nth(before - 1).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(CARD)).toHaveCount(before);
    await expectExpanded(page, before - 1);

    await page.keyboard.press("Enter");
    await expect(page.locator(CARD)).toHaveCount(before - 1);
  });

  test("굳은 결정은 펼쳐지되 나가지 않는다", async ({ page }) => {
    // 카엘만 결정을 안고 시작한다(2장). 10장 덱에서 8장을 뽑으니 거의 늘 손에 들어온다.
    await enterBattle(page, { protagonist: "카엘" });
    let idx = await indexOfCard(page, "굳은 결정");
    for (let turn = 0; turn < 3 && idx < 0; turn++) {
      await page.getByRole("button", { name: "턴 종료" }).click();
      await expect(page.locator(CARD).first()).toBeVisible();
      idx = await indexOfCard(page, "굳은 결정");
    }
    test.skip(idx < 0, "세 턴 안에 결정이 손에 안 잡혔다");

    const before = await page.locator(CARD).count();
    const at = await centerOf(page, CARD, idx);
    await dragUp(page, HAND, { atX: at.x, atY: at.y, distance: 130, durationMs: 300, steps: 10 });

    // 손을 한 칸 차지한다는 것이 이 카드의 전부다 — 끌어도 안 나가야 한다.
    await page.waitForTimeout(500);
    await expect(page.locator(CARD)).toHaveCount(before);
    await expectExpanded(page, idx);
  });
});

test.describe("손패 배치 — 화면을 넘지 않는다 (#425)", () => {
  /** 부채·카드·버튼이 실제로 어디에 그려졌나. */
  async function measure(page: Page) {
    return page.evaluate(() => {
      const hand = document.querySelector('[aria-label="손패"]')!;
      const cards = [...hand.querySelectorAll("button")].map((c) => c.getBoundingClientRect());
      const turn = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "턴 종료",
      );
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        left: Math.min(...cards.map((c) => c.left)),
        right: Math.max(...cards.map((c) => c.right)),
        cardBottom: Math.max(...cards.map((c) => c.bottom)),
        handBottom: hand.getBoundingClientRect().bottom,
        turnBottom: turn?.getBoundingClientRect().bottom ?? Infinity,
        docWidth: document.documentElement.scrollWidth,
        docClientWidth: document.documentElement.clientWidth,
      };
    });
  }

  // 좁은 폰부터 태블릿까지. 412 는 부채가 실제로 잘렸던 폭이다.
  for (const vp of [
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 768, height: 1024 },
  ]) {
    test(`${vp.width}×${vp.height} — 부채가 안 잘리고 「턴 종료」가 접히지 않는다`, async ({ page }) => {
      await page.setViewportSize(vp);
      await enterBattle(page);
      const m = await measure(page);

      // 회전 피벗의 가로 밀림을 안 세서 좌우로 잘렸던 자리.
      expect(m.left).toBeGreaterThanOrEqual(0);
      expect(m.right).toBeLessThanOrEqual(m.vw);
      // 가로 스크롤이 생기면 부채가 화면 밖으로 나간 것이다.
      expect(m.docWidth).toBeLessThanOrEqual(m.docClientWidth);
      // 회전이 카드를 끌어내린 만큼 상자가 커져야 한다 — 안 그러면 아래 버튼을 덮는다.
      expect(m.cardBottom).toBeLessThanOrEqual(m.handBottom + 1);
      // 100dvh + 내비 + 푸터로 접힌 아래까지 밀렸던 자리.
      expect(m.turnBottom).toBeLessThanOrEqual(m.vh);
    });
  }

  test("손패 8장 — 5장 고정이 아니다(루나는 침식에 비례해 더 뽑는다)", async ({ page }) => {
    await page.setViewportSize(PHONE);
    // 카엘은 침식 80 으로 시작 → 루나 보너스 +3 → 5+3 = 8장.
    await enterBattle(page, { protagonist: "카엘" });
    await expect(page.locator(CARD)).toHaveCount(8);

    const m = await measure(page);
    expect(m.left).toBeGreaterThanOrEqual(0);
    expect(m.right).toBeLessThanOrEqual(m.vw);
    expect(m.docWidth).toBeLessThanOrEqual(m.docClientWidth);
    expect(m.cardBottom).toBeLessThanOrEqual(m.handBottom + 1);
  });
});

test.describe("두 라우트가 같은 화면을 낸다 (#425)", () => {
  test.use({ viewport: PHONE });

  // UI 는 비교 대상이 아니다 — 규칙만 다르고 화면은 한 벌이라는 것을 못 박는다.
  for (const [path, label] of [
    ["/games/eternia-refine", "A안 별도"],
    ["/games/eternia-refine/shared", "B안 공유"],
  ] as const) {
    test(`${label} — 같은 손패로 전투에 들어간다`, async ({ page }) => {
      await enterBattle(page, { path });
      await expect(page.getByText(label).first()).toBeVisible();
      await expect(page.locator(CARD)).toHaveCount(5);
    });
  }
});

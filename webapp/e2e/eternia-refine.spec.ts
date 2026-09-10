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
//
// 그리고 **포인터 탭은 카드의 `onClick` 을 타지 않는다.** pointerdown 에서 컨테이너가
// 포인터를 캡처하므로 뒤따르는 click 이 컨테이너로 재타겟된다 — 카드가 펼쳐지는 것은
// `down()` 의 setSel 덕이다. 그래서 `onClick` 의 키보드 분기(detail === 0)는 키보드
// 검사가 유일한 파수꾼이다. 변형 실험으로 확인했다: onClick 을 "누르면 곧 제출"로
// 되돌리면 **키보드 검사만** 깨지고 탭 검사는 멀쩡히 통과한다.

import { test, expect, type Page } from "@playwright/test";
import { dragUp, centerOf, scrubAcross } from "./helpers/pointer-gesture";

const HAND = '[aria-label="손패"]';
const CARD = `${HAND} button`;

/** 사용자가 제보한 기기 폭. 부채가 실제로 잘렸던 화면이다. */
const PHONE = { width: 412, height: 915 };

/** 시험용 고정 씨앗 — 같은 씨앗이면 같은 지도다. */
const SEED = 42;

/** FanHand 의 판정 문턱 — 손짓이 정말 그 편에 섰는지 재려고 그대로 들고 있는다. */
const FLICK_VELOCITY = 0.55;

/**
 * 고른 카드가 올라왔다고 인정하는 높이.
 *
 * FanHand 의 HOVER_LIFT 는 −72 다. 전환이 막 끝나는 순간의 오차를 감안해 70% 인 −50 을
 * 문턱으로 둔다. 쉬는 카드는 포물선 호로 최대 −18 까지만 올라가므로 헷갈릴 여지가 없다.
 */
const LIFTED_AT = -50;

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
async function enterBattle(page: Page, { protagonist, path = "/games/eternia-refine" }: Entry = {}) {
  // **씨앗을 고정한다.** 안 그러면 회차마다 지도가 달라 첫 노드가 전투일 수도, 정제소일
  // 수도 있어 개수 단언이 흔들린다(실제로 흔들렸다).
  await page.goto(`${path}?seed=${SEED}`);
  // #430 부터 타이틀 → 주인공 선택 → **지도** 를 지나야 전투에 닿는다.
  await page.getByRole("button", { name: "새 회차" }).click();
  if (protagonist) {
    await page.locator("button[aria-pressed]").filter({ hasText: protagonist }).click();
  }
  await page.getByRole("button", { name: "운명으로 발을 내딛는다" }).click();
  await gotoBattleFromMap(page);
  await expect(page.locator(HAND)).toBeVisible();
  await expect(page.locator(CARD).first()).toBeVisible();
}

/**
 * 지도에서 전투 노드를 골라 들어간다.
 *
 * 첫 층이 전투가 아닐 수도 있다(정제소·사건). 전투가 설 때까지 앞으로 간다 — 지도는
 * 씨앗에서 나오므로 회차마다 첫 노드가 다르다.
 */
async function gotoBattleFromMap(page: Page) {
  for (let i = 0; i < 10; i++) {
    if (await page.locator(HAND).isVisible().catch(() => false)) return;

    // 사건 노드는 이야기를 보여 준다 (#432) — 읽고 나가면 지도로 돌아온다.
    const story = page.getByRole("button", { name: "길을 이어 간다" });
    if (await story.isVisible().catch(() => false)) {
      await story.click();
      continue;
    }
    // 정제소면 지나간다.
    const leave = page.getByRole("button", { name: "정거장으로 돌아간다" });
    if (await leave.isVisible().catch(() => false)) {
      await leave.click();
      continue;
    }

    const battle = page.getByRole("button", { name: /^전투/ }).first();
    const any = page.getByRole("button", { name: /^(전투|정예|사건|정제소|보스|동맹)/ }).first();
    const target = (await battle.count()) > 0 ? battle : any;
    if ((await target.count()) === 0) return;
    await target.click();
  }
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

    // 첫 누름 뒤 리렌더가 끼면 포커스가 흔들려 두 번째가 엉뚱한 데로 간다 — 병렬 실행에서
    // 실제로 났다. `focus()` 와 `keyboard.press()` 사이에도 그 틈이 있어서(전체 실행 3회 중
    // 1회 실패) 로케이터에 직접 누른다 — 누르는 순간에 그 요소를 잡는다.
    await page.locator(CARD).nth(before - 1).press("Enter");
    await expect(page.locator(CARD)).toHaveCount(before - 1);
  });

  test("좌우로 훑으면 지나는 카드가 그때그때 끝까지 올라온다", async ({ page }) => {
    await enterBattle(page);
    const n = await page.locator(CARD).count();
    const from = await centerOf(page, CARD, 0);
    const to = await centerOf(page, CARD, n - 1);

    const frames = await scrubAcross(page, HAND, {
      fromX: from.x,
      toX: to.x,
      y: from.y,
      steps: 8,
      dwellMs: 60,
      sample: CARD,
    });

    // 이 검사가 잡으려는 회귀: 전환이 200ms 였을 때는 한 장이 −20 쯤 올라가다 다음
    // 카드로 넘어가며 도로 내려갔다. 걸음마다 **아무것도 안 올라온** 프레임이 섞였다.
    for (const f of frames) {
      const lifted = f.items.filter((c) => c.y <= LIFTED_AT);
      expect(lifted, `x=${f.x} 의 세로 위치 ${JSON.stringify(f.items.map((c) => c.y))}`).toHaveLength(
        1,
      );
    }
  });

  test("훑는 동안 이웃은 좌우로 비켜난다", async ({ page }) => {
    await enterBattle(page);
    const n = await page.locator(CARD).count();
    const from = await centerOf(page, CARD, 0);
    const to = await centerOf(page, CARD, n - 1);

    const frames = await scrubAcross(page, HAND, {
      fromX: from.x,
      toX: to.x,
      y: from.y,
      steps: 8,
      dwellMs: 60,
      sample: CARD,
    });

    // 카드 1 은 손가락이 왼쪽 끝에 있을 때 오른쪽으로, 오른쪽 끝에 있을 때 왼쪽으로
    // 비켜난다. 그래서 훑는 동안 x 가 뚜렷이 줄어야 한다(2 × scatter 만큼).
    const early = frames[0].items[1].x;
    const late = frames[frames.length - 1].items[1].x;
    expect(late).toBeLessThan(early - 20);
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

test.describe("이어하기 (#435)", () => {
  test.use({ viewport: PHONE });

  test("지도에서 나갔다 들어오면 이어할 수 있다 — 회차가 날아가지 않는다", async ({ page }) => {
    await page.goto(`/games/eternia-refine?seed=${SEED}`);
    await page.getByRole("button", { name: "새 회차" }).click();
    await page.getByRole("button", { name: "운명으로 발을 내딛는다" }).click();
    // 지도까지 왔다 — 여기서 저장돼 있어야 한다.
    await expect(page.getByRole("button", { name: /^(전투|정예|사건|정제소|보스|동맹)/ }).first())
      .toBeVisible();

    // 브라우저를 닫은 셈 치고 다시 연다.
    await page.goto(`/games/eternia-refine?seed=${SEED}`);
    const resume = page.getByRole("button", { name: /이어하기/ });
    await expect(resume).toBeVisible();
    await resume.click();

    // 지도로 돌아왔다.
    await expect(page.getByRole("button", { name: /^(전투|정예|사건|정제소|보스|동맹)/ }).first())
      .toBeVisible();
  });

  test("새 회차를 고르면 저장본이 사라진다 — 두 판이 섞이지 않는다", async ({ page }) => {
    await page.goto(`/games/eternia-refine?seed=${SEED}`);
    await page.getByRole("button", { name: "새 회차" }).click();
    await page.getByRole("button", { name: "운명으로 발을 내딛는다" }).click();
    await expect(page.getByRole("button", { name: /^(전투|정예|사건|정제소|보스|동맹)/ }).first())
      .toBeVisible();

    await page.goto(`/games/eternia-refine?seed=${SEED}`);
    await expect(page.getByRole("button", { name: /이어하기/ })).toBeVisible();
    await page.getByRole("button", { name: "새 회차" }).click();

    // 주인공 선택으로 갔고, 돌아와도 이어할 것이 없다.
    await expect(page.getByRole("button", { name: "운명으로 발을 내딛는다" })).toBeVisible();
    await page.goto(`/games/eternia-refine?seed=${SEED}`);
    await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
  });
});

test.describe("덱 다듬기 (#439)", () => {
  test.use({ viewport: PHONE });

  test("에테르가 없으면 지울 수 없다고 말해 준다 — 잠자코 막지 않는다", async ({ page }) => {
    await page.goto(`/games/eternia-refine?seed=${SEED}`);
    await page.getByRole("button", { name: "새 회차" }).click();
    await page.getByRole("button", { name: "운명으로 발을 내딛는다" }).click();

    // 정제소에 닿을 때까지 앞으로 간다.
    for (let i = 0; i < 10; i++) {
      if (await page.getByText("덱을 다듬는다").isVisible().catch(() => false)) break;
      const story = page.getByRole("button", { name: "길을 이어 간다" });
      if (await story.isVisible().catch(() => false)) { await story.click(); continue; }
      const refinery = page.getByRole("button", { name: /^정제소/ }).first();
      const any = page.getByRole("button", { name: /^(전투|정예|사건|정제소|보스|동맹)/ }).first();
      const t = (await refinery.count()) > 0 ? refinery : any;
      if ((await t.count()) === 0) break;
      await t.click();
      // 전투가 서면 이 검사는 여기까지 — 정제소를 못 만난 씨앗이다.
      if (await page.locator(HAND).isVisible().catch(() => false)) return;
    }
    if (!(await page.getByText("덱을 다듬는다").isVisible().catch(() => false))) return;

    // 아직 아무것도 안 태웠으니 에테르가 0 이다.
    await expect(page.getByText(/에테르가 모자랍니다/)).toBeVisible();
  });
});

test.describe("더미 들여다보기 (#441)", () => {
  test.use({ viewport: PHONE });

  test("숫자를 누르면 무엇이 남았는지 보인다 — 숫자만으로는 계산할 수 없다", async ({ page }) => {
    await enterBattle(page);
    await page.getByRole("button", { name: /^덱 \d+ · 버림/ }).click();

    await expect(page.getByText("더미", { exact: true })).toBeVisible();
    await expect(page.getByText(/덱 \d+장/)).toBeVisible();
    await expect(page.getByText("순서는 감춘다")).toBeVisible();

    // 손패가 5장이면 덱에는 나머지가 남아 있어야 한다.
    await expect(page.getByText(/버림 \d+장/)).toBeVisible();
  });

  test("닫으면 사라지고 손패가 다시 잡힌다 — 덮개가 판을 막지 않는다", async ({ page }) => {
    await enterBattle(page);
    const before = await page.locator(CARD).count();

    await page.getByRole("button", { name: /^덱 \d+ · 버림/ }).click();
    await expect(page.getByText("더미", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "닫는다" }).click();

    await expect(page.getByText("더미", { exact: true })).toHaveCount(0);
    await expect(page.locator(CARD)).toHaveCount(before);
  });
});

test.describe("전투 판 — 데스크톱·모바일 (#443)", () => {
  const DESKTOP = { width: 1440, height: 900 };

  /**
   * 이웃 카드의 중심 간 거리(px) — 이름이 얼마나 드러나는가.
   *
   * 처음엔 손패 폭을 `.h-1.overflow-hidden`(침식 띠)으로 나눠 "판의 몇 %인가"를 쟀다.
   * 그건 두 번 틀렸다 — 내 Tailwind 유틸리티 클래스를 붙잡았고(디자인이 바뀌면 깨진다),
   * 무엇보다 **폭 비율은 목적이 아니라 대리 지표**였다. 진짜 원하는 것은 "카드 이름이
   * 보이는가"다. 그러니 그것을 직접 잰다.
   *
   * ⚠ **한 번만 재면 안 된다.** 카드에는 200ms 전환이 걸려 있고, FanHand 는 마운트 뒤
   * 컨테이너 폭을 재서(360 기본값 → 실제 폭) 부채를 다시 편다. 그 사이에 재면 중간값이
   * 나온다 — CI 에서 실제로 44.7 이 나와 시험이 깨졌다(목표 72). 부르는 쪽이 `expect.poll`
   * 로 감싸 **자리를 잡을 때까지** 기다린다.
   */
  async function cardPitch(page: Page) {
    const boxes = await page.locator(CARD).evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return r.x + r.width / 2;
      }),
    );
    if (boxes.length < 2) return 0;
    boxes.sort((a, b) => a - b);
    const gaps = boxes.slice(1).map((x, i) => x - boxes[i]);
    return gaps.reduce((a, b) => a + b, 0) / gaps.length;
  }

  test("넓은 화면에서 카드가 이름이 보일 만큼 벌어진다", async ({ page }) => {
    // 카드 폭이 100 이라 간격이 50 아래면 이웃이 절반 넘게 덮는다. 실측에서 「달의 각인」이
    // "달의 각" 으로 보였다. 한때 데스크톱에 좌·우 열을 세웠더니 그 288px 이 손패에서 나가
    // 간격이 41 로 떨어졌다 — 이름을 드러내려던 일이 이름을 더 가렸다.
    await page.setViewportSize(DESKTOP);
    await enterBattle(page);
    await expect.poll(() => cardPitch(page)).toBeGreaterThan(50);
  });

  test("에테르는 손패 아래 붙어 있다 — 카드마다 시선이 왕복하지 않게", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await enterBattle(page);
    const orb = (await page.getByLabel(/^에테르 \d+$/).boundingBox())!;
    const hand = (await page.locator(HAND).boundingBox())!;
    const enemy = (await page.getByLabel(/^다음 수 —/).boundingBox())!;
    // 손패에 붙어 있어야 한다 — 적(무대 위쪽)보다 손패에 훨씬 가까운지로 잰다.
    expect(Math.abs(orb.y - (hand.y + hand.height))).toBeLessThan(60);
    expect(orb.y - enemy.y).toBeGreaterThan(200);
  });

  test("이야기·지도에 저작용 씬 번호가 안 보인다", async ({ page }) => {
    await page.goto(`/games/eternia-refine?seed=${SEED}`);
    await page.getByRole("button", { name: "새 회차" }).click();
    await page.getByRole("button", { name: "운명으로 발을 내딛는다" }).click();
    // 지도든 이야기든, 화면 어디에도 `Scene 04 — ` 같은 내부 ID 가 남으면 안 된다.
    await expect(page.getByText(/Scene\s+[\w-]+\s*[—–-]/)).toHaveCount(0);
    const story = page.getByRole("button", { name: "길을 이어 간다" });
    if (await story.isVisible().catch(() => false)) {
      await expect(page.getByText(/Scene\s+[\w-]+\s*[—–-]/)).toHaveCount(0);
    }
  });

  test("적의 다음 수가 도형과 숫자로 선다 — 턴마다 읽지 않게", async ({ page }) => {
    await enterBattle(page);
    // 접근성 이름으로는 여전히 말이 남는다 — 도형만 남기지 않았다.
    await expect(page.getByLabel(/^다음 수 —/)).toBeVisible();
    expect(await page.getByLabel(/^다음 수 —/).locator("svg").count()).toBeGreaterThan(0);
  });

  test("모바일에서 조작대가 화면을 넘지 않는다", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await enterBattle(page);
    for (const l of [page.locator(HAND), page.getByRole("button", { name: "턴 종료" })]) {
      const b = (await l.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(PHONE.width + 1);
    }
    // 여기서 간격은 단언하지 않는다. **좁은 화면에서 좁아지는 것이 정상**이다 —
    // `fit()` 이 부채를 잘리게 두느니 간격을 줄인다(412px·6장이면 44.8). 그 규칙은
    // `fan-geometry.test.ts` 가 폭을 훑어 가며 덮는다. 여기서 50 을 요구하면 화면이
    // 좁다는 이유만으로 빨간불이 켜진다 — 실제로 CI 에서 그렇게 깨졌다.
  });
});

test.describe("지도 — 가로로 안 넘친다 (#457)", () => {
  test.use({ viewport: PHONE });

  test("모바일에서 지도에 가로 스크롤이 없다", async ({ page }) => {
    await page.goto(`/games/eternia-refine?seed=${SEED}`);
    await page.getByRole("button", { name: "새 회차" }).click();
    await page.getByRole("button", { name: "운명으로 발을 내딛는다" }).click();
    await expect(page.getByRole("img", { name: "지도" })).toBeVisible();

    const box = page.locator('div:has(> svg[aria-label="지도"])').last();
    const over = await box.evaluate((el) => ({
      scrollW: el.scrollWidth,
      clientW: el.clientWidth,
    }));
    // 1px 은 반올림 몫이다. 그 이상 넘으면 손가락으로 옆으로 밀 수 있다는 뜻이다.
    expect(over.scrollW).toBeLessThanOrEqual(over.clientW + 1);
  });

  test("문서 전체도 가로로 안 넘친다 — 루트에 스크롤바가 생기면 안 된다", async ({ page }) => {
    await page.goto(`/games/eternia-refine?seed=${SEED}`);
    await page.getByRole("button", { name: "새 회차" }).click();
    await page.getByRole("button", { name: "운명으로 발을 내딛는다" }).click();
    await expect(page.getByRole("img", { name: "지도" })).toBeVisible();

    const doc = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    expect(doc.scrollW).toBeLessThanOrEqual(doc.clientW + 1);
  });

  test("노드 이름이 지도 밖으로 안 나간다", async ({ page }) => {
    await page.goto(`/games/eternia-refine?seed=${SEED}`);
    await page.getByRole("button", { name: "새 회차" }).click();
    await page.getByRole("button", { name: "운명으로 발을 내딛는다" }).click();
    const svg = page.getByRole("img", { name: "지도" });
    await expect(svg).toBeVisible();

    const svgBox = (await svg.boundingBox())!;
    const texts = await svg.locator("text").all();
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      const b = (await t.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(svgBox.x - 1);
      expect(b.x + b.width).toBeLessThanOrEqual(svgBox.x + svgBox.width + 1);
    }
  });
});

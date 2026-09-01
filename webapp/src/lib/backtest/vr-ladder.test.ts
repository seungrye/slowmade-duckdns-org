import { describe, it, expect } from "vitest";
import { ladderLot, vrBuyLadder, vrSellLadder } from "./vr-ladder";

/**
 * VR 사다리 — 문서(2025 VR 강의 정리)의 주문표를 그대로 재현한다 (#360).
 *
 * 문서는 밴드 경계를 기준으로 **1주씩 지정가**를 2주 기간잔량으로 미리 걸어 둔다.
 * 지금 백테스트·라이브는 종가에 밴드 경계까지 한 번에 체결해서, 장중에 밴드를 스치고
 * 돌아오는 움직임을 통째로 놓친다.
 *
 * 가격 규칙은 문서 표에서 정확히 읽힌다.
 *   매수: n 주 들고 있을 때 n+1 번째를 사는 지정가 = 밴드하단 ÷ n
 *   매도: n 주에서 n−1 로 줄이는 지정가     = 밴드상단 ÷ n
 *
 * 즉 "그 가격이 되면 평가금이 정확히 밴드 경계" 인 지점마다 한 주씩 걸어 두는 것이다.
 */
describe("vrBuyLadder — 6기 33주차 매수표", () => {
  // 밴드하단 $1,707.78 · 보유 25주 · Pool $375.79 (한도 없음)
  const 사다리 = vrBuyLadder({ low: 1707.78, qty: 25, pool: 375.79, budget: 375.79 });

  it("문서의 지정가·주문 후 Pool 을 그대로 낸다", () => {
    expect(사다리.map((r) => [r.qtyAfter, Number(r.price.toFixed(2)), Number(r.poolAfter.toFixed(2))])).toEqual([
      [26, 68.31, 307.48],
      [27, 65.68, 241.79],
      [28, 63.25, 178.54],
      [29, 60.99, 117.55],
      [30, 58.89, 58.66],
      [31, 56.93, 1.74],
    ]);
  });

  it("Pool 이 다음 칸을 못 감당하면 거기서 멈춘다", () => {
    // 다음 칸은 1707.78/31 = 55.09 인데 Pool 이 1.74 뿐이다.
    expect(사다리).toHaveLength(6);
    expect(사다리[사다리.length - 1].qtyAfter).toBe(31);
  });
});

describe("vrSellLadder — 6기 33주차 매도표", () => {
  // 밴드상단 $2,310.52 · 보유 25주 · Pool $375.79
  it("문서의 지정가·주문 후 Pool 을 그대로 낸다", () => {
    const 사다리 = vrSellLadder({ high: 2310.52, qty: 25, pool: 375.79, maxRungs: 6 });
    expect(사다리.map((r) => [r.qtyAfter, Number(r.price.toFixed(2)), Number(r.poolAfter.toFixed(2))])).toEqual([
      [24, 92.42, 468.21],
      [23, 96.27, 564.48],
      [22, 100.46, 664.94],
      [21, 105.02, 769.96],
      [20, 110.02, 879.99],
      [19, 115.53, 995.51],
    ]);
  });

  it("가진 것보다 많이 팔지 않는다", () => {
    expect(vrSellLadder({ high: 1000, qty: 3, pool: 0 })).toHaveLength(3);
  });
});

describe("vrBuyLadder — 4기 87주차 매수표 (매수 한도 70%)", () => {
  // 밴드하단 $5,270.03 · 보유 85주 · Pool $982.22 · 한도 70%
  const 사다리 = vrBuyLadder({ low: 5270.03, qty: 85, pool: 982.22, budget: 982.22 * 0.7 });

  it("한도가 다음 칸을 못 감당하면 멈춘다 — 문서와 같은 96주·Pool 337.31", () => {
    const 끝 = 사다리[사다리.length - 1];
    expect(끝.qtyAfter).toBe(96);
    expect(Number(끝.poolAfter.toFixed(2))).toBe(337.31);
  });

  it("문서 표의 앞 칸들이 맞는다", () => {
    expect(사다리.slice(0, 3).map((r) => [r.qtyAfter, Number(r.price.toFixed(2))])).toEqual([
      [86, 62.00], [87, 61.28], [88, 60.58],
    ]);
  });

  it("한도는 Pool 과 별개다 — 한도가 작으면 Pool 이 남아도 멈춘다", () => {
    const 짧게 = vrBuyLadder({ low: 5270.03, qty: 85, pool: 982.22, budget: 130 });
    expect(짧게).toHaveLength(2);          // 62.00 + 61.28 = 123.28, 다음 칸이면 183.86 > 130
    expect(짧게[1].poolAfter).toBeGreaterThan(800);  // Pool 은 넉넉히 남아 있다
  });
});

describe("사다리 경계", () => {
  it("보유가 0 이면 매수 사다리를 못 만든다 — 나눌 수가 없다", () => {
    // 밴드하단 ÷ 보유수 인데 보유가 0 이면 정의되지 않는다. 첫 진입은 seedVR 의 몫이다.
    expect(vrBuyLadder({ low: 1000, qty: 0, pool: 1000, budget: 1000 })).toEqual([]);
    expect(vrSellLadder({ high: 1000, qty: 0, pool: 0 })).toEqual([]);
  });

  it("밴드 경계가 0 이하면 빈 사다리", () => {
    expect(vrBuyLadder({ low: 0, qty: 10, pool: 100, budget: 100 })).toEqual([]);
    expect(vrSellLadder({ high: -1, qty: 10, pool: 0 })).toEqual([]);
  });

  it("살 돈이 없으면 빈 사다리", () => {
    expect(vrBuyLadder({ low: 1000, qty: 10, pool: 0, budget: 0 })).toEqual([]);
  });

  it("가격이 칸마다 낮아지고(매수) 높아진다(매도) — 방향이 뒤집히면 주문이 뒤엉킨다", () => {
    const 매수 = vrBuyLadder({ low: 1707.78, qty: 25, pool: 1e9, budget: 1e9 }).slice(0, 5);
    expect(매수.every((r, i) => i === 0 || r.price < 매수[i - 1].price)).toBe(true);
    const 매도 = vrSellLadder({ high: 2310.52, qty: 25, pool: 0, maxRungs: 5 });
    expect(매도.every((r, i) => i === 0 || r.price > 매도[i - 1].price)).toBe(true);
  });
});

describe("ladderLot — 문서 규모에서는 1주씩 (#360)", () => {
  it("4기 87주차(85주 보유·한도 687.55)는 1주씩이다", () => {
    // 보유량으로 잡으면 여기서 7주씩이 되어 문서(11칸을 1주씩)와 어긋난다.
    expect(ladderLot({ low: 5270.03, qty: 85, budget: 982.22 * 0.7, maxRungs: 12 })).toBe(1);
  });

  it("6기 33주차(25주 보유·Pool 375.79)도 1주씩이다", () => {
    expect(ladderLot({ low: 1707.78, qty: 25, budget: 375.79, maxRungs: 12 })).toBe(1);
  });

  it("분할조정 저가 종목처럼 칸이 수만 개가 되면 칸을 키운다", () => {
    // 실측: TQQQ 2011년 — 보유 21만 주, 첫 칸 0.372달러, 예산 7500 → 2만 칸이 필요하다.
    const lot = ladderLot({ low: 78625, qty: 211180, budget: 7500, maxRungs: 40 });
    expect(lot).toBeGreaterThan(100);
    // 그래도 칸 수는 상한 안에 들어와야 한다.
    expect(vrBuyLadder({ low: 78625, qty: 211180, pool: 15000, budget: 7500, lot, maxRungs: 40 }).length)
      .toBeLessThanOrEqual(40);
  });

  it("살 돈이 없으면 1주씩으로 둔다 — 0 으로 나누지 않는다", () => {
    expect(ladderLot({ low: 1000, qty: 10, budget: 0, maxRungs: 12 })).toBe(1);
    expect(ladderLot({ low: 0, qty: 10, budget: 100, maxRungs: 12 })).toBe(1);
    expect(ladderLot({ low: 1000, qty: 0, budget: 100, maxRungs: 12 })).toBe(1);
  });
});

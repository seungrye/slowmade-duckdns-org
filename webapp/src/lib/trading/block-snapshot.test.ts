import { describe, it, expect } from "vitest";
import { blockSnapshot } from "./block-snapshot";

/**
 * Per-block asset snapshot (#367 (2)).
 *
 * `portfoliohistories` was keyed only by (env, currency, date), so a US account with two
 * blocks (TQQQ v4 and SOXL VR) still had a single USD row. Worse, both blocks ran
 * close-sync and **overwrote the same slot** - invisible because the account-wide values matched.
 *
 * A block row records **only what that block knows**. Each engine has its own cash ledger.
 *
 *   infinite_v4        state.v4.cycleCash
 *   value_rebalancing  state.vr.pool
 *   anything else      none -> leave cash empty (null, not 0; 0 is a lie meaning "no cash")
 */
const rows: [string, number, number, number][] = [
  // [symbol, qty, avgPrice, currentPrice]
  ["TQQQ", 100, 70, 80],
  ["SOXL", 50, 20, 25],
];

describe("blockSnapshot — 종목 고르기", () => {
  it("v4 는 config.symbol 하나만 본다", () => {
    const s = blockSnapshot({ strategy: "infinite_v4", config: { symbol: "TQQQ" },
      state: { v4: { cycleCash: 1000 } }, evalRows: rows, hvBroker: 0 })!;
    expect(s.symbols).toEqual(["TQQQ"]);
    expect(s.holdingsValue).toBe(8000);          // 100 x 80 - SOXL belongs to someone else
  });

  it("VR 도 config.symbol 하나만 본다", () => {
    const s = blockSnapshot({ strategy: "value_rebalancing", config: { symbol: "SOXL" },
      state: { vr: { pool: 500 } }, evalRows: rows, hvBroker: 0 })!;
    expect(s.holdingsValue).toBe(1250);          // 50 × 25
  });

  it("추세추종은 universe 전체를 본다", () => {
    const s = blockSnapshot({ strategy: "trend_v1", config: { universe: ["TQQQ", "SOXL"] },
      state: {}, evalRows: rows, hvBroker: 0 })!;
    expect(s.holdingsValue).toBe(9250);
  });

  it("종목을 알 수 없는 전략은 아무것도 안 쓴다 — 0 을 적으면 거짓말이다", () => {
    // rotation auto-selects its candidates, so config alone does not say.
    expect(blockSnapshot({ strategy: "rotation_v1", config: {}, state: {}, evalRows: rows, hvBroker: 0 })).toBeNull();
  });

  it("안 가진 종목이면 평가금 0 — 그래도 행은 쓴다(현금은 있다)", () => {
    const s = blockSnapshot({ strategy: "infinite_v4", config: { symbol: "NVDA" },
      state: { v4: { cycleCash: 1000 } }, evalRows: rows, hvBroker: 0 })!;
    expect(s.holdingsValue).toBe(0);
    expect(s.totalValue).toBe(1000);
  });
});

describe("blockSnapshot — 현금 장부", () => {
  it("v4 는 cycleCash 를 쓴다", () => {
    const s = blockSnapshot({ strategy: "infinite_v4", config: { symbol: "TQQQ" },
      state: { v4: { cycleCash: 51345.2 } }, evalRows: rows, hvBroker: 0 })!;
    expect(s.cash).toBeCloseTo(51345.2, 2);
    expect(s.totalValue).toBeCloseTo(51345.2 + 8000, 2);
  });

  it("VR 은 pool 을 쓴다", () => {
    const s = blockSnapshot({ strategy: "value_rebalancing", config: { symbol: "SOXL" },
      state: { vr: { pool: 1200 } }, evalRows: rows, hvBroker: 0 })!;
    expect(s.cash).toBe(1200);
  });

  it("장부가 없으면 cash 는 null 이고 총액은 평가금만", () => {
    const s = blockSnapshot({ strategy: "trend_v1", config: { universe: ["TQQQ"] },
      state: {}, evalRows: rows, hvBroker: 0 })!;
    expect(s.cash).toBeNull();
    expect(s.totalValue).toBe(8000);
  });

  it("아직 한 번도 안 돈 블록(state 비어 있음)도 견딘다", () => {
    const s = blockSnapshot({ strategy: "value_rebalancing", config: { symbol: "SOXL" },
      state: {}, evalRows: rows, hvBroker: 0 })!;
    expect(s.cash).toBeNull();
    expect(s.holdingsValue).toBe(1250);
  });
});

describe("blockSnapshot — 증권사 총평가금 분기", () => {
  // When the broker gives a total valuation, close-sync never fetches per-symbol prices. The
  // price slot of evalRows then holds the **average price** - used as is, the block value becomes cost.
  // Scale it proportionally so the total matches.
  const 원가행: [string, number, number, number][] = [
    ["TQQQ", 100, 70, 70],   // 원가 7000
    ["SOXL", 50, 20, 20],    // 원가 1000
  ];

  it("원가 합을 증권사 총평가금에 맞춰 늘린다", () => {
    // Cost total 8000, broker 9250 -> ratio 1.15625. TQQQ's share 7000 x 1.15625 = 8093.75
    const s = blockSnapshot({ strategy: "infinite_v4", config: { symbol: "TQQQ" },
      state: { v4: { cycleCash: 0 } }, evalRows: 원가행, hvBroker: 9250 })!;
    expect(s.holdingsValue).toBeCloseTo(8093.75, 2);
  });

  it("원가 합이 0 이면 스케일하지 않는다 — 0 으로 나누지 않는다", () => {
    const s = blockSnapshot({ strategy: "infinite_v4", config: { symbol: "TQQQ" },
      state: { v4: { cycleCash: 100 } }, evalRows: [], hvBroker: 9250 })!;
    expect(s.holdingsValue).toBe(0);
  });
});

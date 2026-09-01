import { describe, it, expect } from "vitest";
import { blockSnapshot } from "./block-snapshot";

/**
 * 블록별 자산 스냅샷 (#367 ②).
 *
 * `portfoliohistories` 가 (env, currency, date) 로만 저장돼, 미국 계좌에 블록이 둘
 * (TQQQ v4 · SOXL VR)이어도 USD 줄이 하나였다. 게다가 두 블록이 각각 close-sync 를
 * 돌며 **같은 자리에 덮어쓰고** 있었다(계좌 전체 값이라 값이 같아서 안 드러났다).
 *
 * 블록 행에는 **그 블록이 아는 것만** 적는다. 엔진마다 자기 현금 장부가 있다.
 *
 *   infinite_v4        state.v4.cycleCash
 *   value_rebalancing  state.vr.pool
 *   그 밖              없다 → cash 를 비운다(0 이 아니라 null. 0 은 "현금이 없다"는 거짓말이다)
 */
const rows: [string, number, number, number][] = [
  // [심볼, 수량, 평단, 현재가]
  ["TQQQ", 100, 70, 80],
  ["SOXL", 50, 20, 25],
];

describe("blockSnapshot — 종목 고르기", () => {
  it("v4 는 config.symbol 하나만 본다", () => {
    const s = blockSnapshot({ strategy: "infinite_v4", config: { symbol: "TQQQ" },
      state: { v4: { cycleCash: 1000 } }, evalRows: rows, hvBroker: 0 })!;
    expect(s.symbols).toEqual(["TQQQ"]);
    expect(s.holdingsValue).toBe(8000);          // 100 × 80 — SOXL 은 남의 것이다
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
    // rotation 은 후보를 자동 선발해서 config 만으로는 모른다.
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
  // 증권사가 총평가금을 주면 close-sync 는 종목별 현재가를 안 부른다. 그때 evalRows 의
  // price 자리에는 **평단**이 들어온다 — 그대로 쓰면 블록 평가금이 원가가 된다.
  // 총합이 맞도록 비율로 늘려 근사한다.
  const 원가행: [string, number, number, number][] = [
    ["TQQQ", 100, 70, 70],   // 원가 7000
    ["SOXL", 50, 20, 20],    // 원가 1000
  ];

  it("원가 합을 증권사 총평가금에 맞춰 늘린다", () => {
    // 원가 합 8000, 증권사 9250 → 배율 1.15625. TQQQ 몫 7000 × 1.15625 = 8093.75
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

import { describe, it, expect } from "vitest";
import { momentum, compositeMomentum } from "@/lib/trading/strategies";
import { dualMomentumDecide, runDualMomentumBacktest } from "./dual-momentum";
import { targetExposure, realizedVol, runVolTargetBacktest } from "./vol-target";
import type { Bar } from "./types";

const D = (i: number) => `2020-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
const mk = (closes: number[]): Bar[] => closes.map((c, i) => ({ date: D(i), open: c, high: c, low: c, close: c }));

// TDD for the three new strategies' pure logic (composite momentum, dual momentum, volatility targeting).

describe("compositeMomentum — 멀티 룩백 모멘텀 평균", () => {
  const closes = [110, 105, 100]; // newest first: today 110, one day ago 105, two days ago 100
  it("단일 룩백이면 momentum 과 동일", () => {
    expect(compositeMomentum(closes, [2])).toBeCloseTo(momentum(closes, 2)!, 10);
  });
  it("여러 룩백의 평균", () => {
    const m1 = momentum(closes, 1)!; // 110/105-1
    const m2 = momentum(closes, 2)!; // 110/100-1
    expect(compositeMomentum(closes, [1, 2])).toBeCloseTo((m1 + m2) / 2, 10);
  });
  it("데이터 부족 룩백(null)은 건너뛰고 평균", () => {
    // a lookback of 5 is null at length 3 -> excluded, so only [1, 2] are averaged
    const m1 = momentum(closes, 1)!, m2 = momentum(closes, 2)!;
    expect(compositeMomentum(closes, [1, 2, 5])).toBeCloseTo((m1 + m2) / 2, 10);
  });
  it("전부 데이터 부족이면 null", () => {
    expect(compositeMomentum(closes, [5, 10])).toBeNull();
  });
});

describe("dualMomentumDecide — GEM(상대+절대 모멘텀)", () => {
  it("1위 후보 모멘텀 > 방어 모멘텀이면 그 후보 보유", () => {
    const d = dualMomentumDecide({ candidates: ["A", "B"], candMom: { A: 0.30, B: 0.10 }, defensiveTicker: "IEF", defensiveMom: 0.05 });
    expect(d.target).toBe("A");
  });
  it("1위 후보 모멘텀 ≤ 방어 모멘텀이면 방어자산으로 대피", () => {
    const d = dualMomentumDecide({ candidates: ["A", "B"], candMom: { A: 0.02, B: -0.1 }, defensiveTicker: "IEF", defensiveMom: 0.05 });
    expect(d.target).toBe("IEF");
  });
  it("후보 데이터 전무면 방어자산", () => {
    const d = dualMomentumDecide({ candidates: ["A", "B"], candMom: { A: null, B: null }, defensiveTicker: "IEF", defensiveMom: 0.03 });
    expect(d.target).toBe("IEF");
  });
  it("둘 다 음수라도 1위가 방어보다 높으면 1위 보유(상대 우위)", () => {
    const d = dualMomentumDecide({ candidates: ["A"], candMom: { A: -0.2 }, defensiveTicker: "IEF", defensiveMom: -0.3 });
    expect(d.target).toBe("A");
  });
});

describe("vol-target — 실현변동성·목표노출", () => {
  it("realizedVol: 일간수익 표준편차 × √252", () => {
    // returns [0.01, -0.01, 0.01, -0.01], population standard deviation = 0.01 -> x sqrt(252)
    const v = realizedVol([0.01, -0.01, 0.01, -0.01]);
    expect(v).toBeCloseTo(0.01 * Math.sqrt(252), 6);
  });
  it("realizedVol: 데이터 부족이면 null", () => {
    expect(realizedVol([0.01])).toBeNull();
  });
  it("targetExposure: min(maxLev, targetVol/실현변동성)", () => {
    expect(targetExposure(0.4, 0.2, 1.0)).toBeCloseTo(0.5, 10); // 0.2/0.4=0.5
    expect(targetExposure(0.1, 0.2, 1.0)).toBeCloseTo(1.0, 10); // 2.0 → cap 1.0
    expect(targetExposure(0.4, 0.2, 2.0)).toBeCloseTo(0.5, 10);
  });
  it("targetExposure: 실현변동성 0 이하면 maxLev", () => {
    expect(targetExposure(0, 0.2, 1.0)).toBe(1.0);
  });
});

describe("runDualMomentumBacktest — 러너 스모크", () => {
  it("위험자산 상승 시 보유, 급락하면 방어자산으로 대피", () => {
    const rise = Array.from({ length: 40 }, (_, i) => 100 + i * 2); // a steady rise
    const crash = [140, 120, 100, 80, 60, 50]; // a crash at the end
    const A = mk([...rise, ...crash]);
    const IEF = mk(Array(A.length).fill(100)); // the defensive asset is flat
    const r = runDualMomentumBacktest([{ ticker: "A", bars: A }], { ticker: "IEF", bars: IEF },
      { principal: 10000, momDays: 5, rebalanceDays: 3, feeRate: 0 });
    const buys = r.trades.filter((t) => t.side === "buy");
    expect(buys.some((t) => t.ticker === "A")).toBe(true); // buys A during the rise
    expect(buys.some((t) => t.ticker === "IEF")).toBe(true); // moves to the defensive asset after the crash
    expect(r.equityCurve.length).toBeGreaterThan(0);
  });
});

describe("runVolTargetBacktest — 러너 스모크", () => {
  it("저변동성 상승자산이면 진입해 자산이 는다", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 * (1 + i * 0.003)); // a gentle, low-volatility rise
    const r = runVolTargetBacktest({ ticker: "TQQQ", bars: mk(closes) },
      { principal: 10000, targetVolPct: 25, volLookback: 20, maxLeverage: 1.0, rebalanceBand: 0.05, feeRate: 0 });
    expect(r.trades.filter((t) => t.side === "buy").length).toBeGreaterThan(0);
    expect(r.equityCurve.at(-1)!.equity).toBeGreaterThan(10000);
  });
});

// Accumulating (a monthly deposit) removes cash drag. Dates cross months (the next month every 5 trading days) to check the month-boundary deposit.
const DM = (i: number) => `2020-${String(Math.floor(i / 5) + 1).padStart(2, "0")}-${String((i % 5) + 1).padStart(2, "0")}`;
const mkM = (closes: number[]): Bar[] => closes.map((c, i) => ({ date: DM(i), open: c, high: c, low: c, close: c }));

describe("runDualMomentumBacktest — 적립식", () => {
  const A = mkM(Array.from({ length: 15 }, (_, i) => 100 + i * 2)); // rising -> always the leader
  const IEF = mkM(Array(15).fill(100));
  const base = { principal: 10000, momDays: 2, rebalanceDays: 3 };

  it("월경계 입금을 보유 자산에 즉시 증액(항상 투자 상태)", () => {
    const r = runDualMomentumBacktest([{ ticker: "A", bars: A }], { ticker: "IEF", bars: IEF }, { ...base, contribution: 1000 });
    expect(r.contributions).toHaveLength(2); // the February/March boundary
    expect(r.totalContributed).toBe(10000 + 1000 * 2);
    const noC = runDualMomentumBacktest([{ ticker: "A", bars: A }], { ticker: "IEF", bars: IEF }, base);
    const q = (x: typeof r) => x.trades.filter((t) => t.side === "buy").reduce((s, t) => s + t.qty, 0);
    expect(q(r)).toBeGreaterThan(q(noC)); // the holding grows by the deposit
  });

  it("contribution 미지정이면 기존과 동일(회귀)", () => {
    const a = runDualMomentumBacktest([{ ticker: "A", bars: A }], { ticker: "IEF", bars: IEF }, base);
    const b = runDualMomentumBacktest([{ ticker: "A", bars: A }], { ticker: "IEF", bars: IEF }, { ...base, contribution: 0 });
    expect(b.trades).toEqual(a.trades);
    expect(b.equityCurve).toEqual(a.equityCurve);
    expect(a.contributions).toBeUndefined();
  });
});

describe("runVolTargetBacktest — 적립식", () => {
  const closes = Array.from({ length: 15 }, (_, i) => 100 * (1 + i * 0.003)); // a low-volatility rise -> f is about 1
  const base = { principal: 10000, targetVolPct: 25, volLookback: 5, maxLeverage: 1.0, rebalanceBand: 0.05 };

  it("월경계 입금을 강제 리밸런스로 배분 — 최종 자산이 무적립보다 크다", () => {
    const r = runVolTargetBacktest({ ticker: "TQQQ", bars: mkM(closes) }, { ...base, contribution: 1000 });
    expect(r.contributions).toHaveLength(2);
    expect(r.totalContributed).toBe(10000 + 1000 * 2);
    const noC = runVolTargetBacktest({ ticker: "TQQQ", bars: mkM(closes) }, base);
    expect(r.equityCurve.at(-1)!.equity).toBeGreaterThan(noC.equityCurve.at(-1)!.equity + 1500);
  });

  it("contribution 미지정이면 기존과 동일(회귀)", () => {
    const a = runVolTargetBacktest({ ticker: "TQQQ", bars: mkM(closes) }, base);
    const b = runVolTargetBacktest({ ticker: "TQQQ", bars: mkM(closes) }, { ...base, contribution: 0 });
    expect(b.trades).toEqual(a.trades);
    expect(b.equityCurve).toEqual(a.equityCurve);
    expect(a.contributions).toBeUndefined();
  });
});

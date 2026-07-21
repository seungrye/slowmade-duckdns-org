import { describe, it, expect } from "vitest";
import { computeMetrics } from "./metrics";
import type { EquityPoint } from "./types";

const curve = (eqs: number[]): EquityPoint[] => eqs.map((e, i) => ({ date: String(i), equity: e }));

describe("backtest metrics — computeMetrics", () => {
  it("빈 곡선은 0 지표", () => {
    const m = computeMetrics([], 1000);
    expect(m).toEqual({ final: 1000, totalReturnPct: 0, cagr: 0, mdd: 0, calmar: 0, sharpe: 0 });
  });

  it("MDD = peak 대비 최저 낙폭(%)", () => {
    // peak 100→120, 저점 60 → 60/120-1 = -50%
    const m = computeMetrics(curve([100, 120, 60, 90]), 100);
    expect(m.mdd).toBeCloseTo(-50, 6);
  });

  it("누적수익률 = 최종/원금 - 1", () => {
    const m = computeMetrics(curve([100, 150, 130]), 100);
    expect(m.final).toBe(130);
    expect(m.totalReturnPct).toBeCloseTo(30, 6);
  });

  it("CAGR: 252거래일에 2배면 연 100%", () => {
    const eqs = Array.from({ length: 252 }, (_, i) => (i === 251 ? 200 : 100));
    const m = computeMetrics(curve(eqs), 100);
    expect(m.cagr).toBeCloseTo(100, 4);
  });

  it("CAGR: 1008거래일(4년)에 16배면 연 100%", () => {
    const eqs = Array.from({ length: 1008 }, (_, i) => (i === 1007 ? 1600 : 100));
    const m = computeMetrics(curve(eqs), 100);
    expect(m.cagr).toBeCloseTo(100, 4);
  });

  it("Calmar = CAGR / |MDD|", () => {
    const eqs: number[] = Array.from({ length: 252 }, (_, i) => (i === 251 ? 200 : 100));
    const withDip: number[] = [...eqs];
    withDip[100] = 50; // peak 100 대비 -50% 낙폭 주입
    const m = computeMetrics(curve(withDip), 100);
    expect(m.mdd).toBeCloseTo(-50, 6);
    expect(m.calmar).toBeCloseTo(m.cagr / 50, 6);
  });

  it("Sharpe: 일간수익 변동 0이면 0, 꾸준한 상승이면 양수", () => {
    const flat = computeMetrics(curve([100, 100, 100, 100]), 100);
    expect(flat.sharpe).toBe(0); // 수익 변동 없음
    const up = computeMetrics(curve([100, 101, 102, 103, 104]), 100);
    expect(up.sharpe).toBeGreaterThan(0);
  });
});

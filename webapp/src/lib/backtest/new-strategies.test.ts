import { describe, it, expect } from "vitest";
import { momentum, compositeMomentum } from "@/lib/trading/strategies";
import { dualMomentumDecide, runDualMomentumBacktest } from "./dual-momentum";
import { targetExposure, realizedVol, runVolTargetBacktest } from "./vol-target";
import type { Bar } from "./types";

const D = (i: number) => `2020-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
const mk = (closes: number[]): Bar[] => closes.map((c, i) => ({ date: D(i), open: c, high: c, low: c, close: c }));

// 신규 전략 3종의 순수 로직 TDD. (복합 모멘텀·듀얼 모멘텀·변동성 타깃)

describe("compositeMomentum — 멀티 룩백 모멘텀 평균", () => {
  const closes = [110, 105, 100]; // 최신순: 오늘 110, 1일전 105, 2일전 100
  it("단일 룩백이면 momentum 과 동일", () => {
    expect(compositeMomentum(closes, [2])).toBeCloseTo(momentum(closes, 2)!, 10);
  });
  it("여러 룩백의 평균", () => {
    const m1 = momentum(closes, 1)!; // 110/105-1
    const m2 = momentum(closes, 2)!; // 110/100-1
    expect(compositeMomentum(closes, [1, 2])).toBeCloseTo((m1 + m2) / 2, 10);
  });
  it("데이터 부족 룩백(null)은 건너뛰고 평균", () => {
    // 룩백 5 는 길이 3 이라 null → 제외, [1,2] 만 평균
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
    // 수익 [0.01,-0.01,0.01,-0.01] 표준편차(모표준편차) = 0.01 → ×√252
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
    const rise = Array.from({ length: 40 }, (_, i) => 100 + i * 2); // 꾸준히 상승
    const crash = [140, 120, 100, 80, 60, 50]; // 마지막 급락
    const A = mk([...rise, ...crash]);
    const IEF = mk(Array(A.length).fill(100)); // 방어 플랫
    const r = runDualMomentumBacktest([{ ticker: "A", bars: A }], { ticker: "IEF", bars: IEF },
      { principal: 10000, momDays: 5, rebalanceDays: 3, feeRate: 0 });
    const buys = r.trades.filter((t) => t.side === "buy");
    expect(buys.some((t) => t.ticker === "A")).toBe(true); // 상승 구간 A 매수
    expect(buys.some((t) => t.ticker === "IEF")).toBe(true); // 급락 후 방어 대피
    expect(r.equityCurve.length).toBeGreaterThan(0);
  });
});

describe("runVolTargetBacktest — 러너 스모크", () => {
  it("저변동성 상승자산이면 진입해 자산이 는다", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 * (1 + i * 0.003)); // 완만·저변동 상승
    const r = runVolTargetBacktest({ ticker: "TQQQ", bars: mk(closes) },
      { principal: 10000, targetVolPct: 25, volLookback: 20, maxLeverage: 1.0, rebalanceBand: 0.05, feeRate: 0 });
    expect(r.trades.filter((t) => t.side === "buy").length).toBeGreaterThan(0);
    expect(r.equityCurve.at(-1)!.equity).toBeGreaterThan(10000);
  });
});

// 적립식(월 입금) — 현금 드래그 제거. 월을 넘기는 날짜(5거래일마다 다음 달)로 월경계 입금 확인.
const DM = (i: number) => `2020-${String(Math.floor(i / 5) + 1).padStart(2, "0")}-${String((i % 5) + 1).padStart(2, "0")}`;
const mkM = (closes: number[]): Bar[] => closes.map((c, i) => ({ date: DM(i), open: c, high: c, low: c, close: c }));

describe("runDualMomentumBacktest — 적립식", () => {
  const A = mkM(Array.from({ length: 15 }, (_, i) => 100 + i * 2)); // 상승 → 항상 1위
  const IEF = mkM(Array(15).fill(100));
  const base = { principal: 10000, momDays: 2, rebalanceDays: 3 };

  it("월경계 입금을 보유 자산에 즉시 증액(항상 투자 상태)", () => {
    const r = runDualMomentumBacktest([{ ticker: "A", bars: A }], { ticker: "IEF", bars: IEF }, { ...base, contribution: 1000 });
    expect(r.contributions).toHaveLength(2); // 2·3월 경계
    expect(r.totalContributed).toBe(10000 + 1000 * 2);
    const noC = runDualMomentumBacktest([{ ticker: "A", bars: A }], { ticker: "IEF", bars: IEF }, base);
    const q = (x: typeof r) => x.trades.filter((t) => t.side === "buy").reduce((s, t) => s + t.qty, 0);
    expect(q(r)).toBeGreaterThan(q(noC)); // 입금분만큼 보유수량↑
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
  const closes = Array.from({ length: 15 }, (_, i) => 100 * (1 + i * 0.003)); // 저변동 상승 → f≈1
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

import { describe, it, expect } from "vitest";
import { computeMetrics } from "./metrics";
import type { EquityPoint } from "./types";

const curve = (eqs: number[]): EquityPoint[] => eqs.map((e, i) => ({ date: String(i), equity: e }));

describe("backtest metrics — computeMetrics", () => {
  it("빈 곡선은 0 지표", () => {
    const m = computeMetrics([], 1000);
    expect(m).toEqual({ final: 1000, totalReturnPct: 0, cagr: 0, mdd: 0, calmar: 0, sharpe: 0, volatility: 0 });
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

describe("computeMetrics — 적립식(TWR) 보정", () => {
  it("기여금 유입을 제거한 시간가중수익(TWR)으로 총수익·MDD 계산", () => {
    // day0 100 → day1 110(+10%, 무입금) → day2 입금100 후 +10% = (110+100)*1.1 = 231
    const c: EquityPoint[] = [
      { date: "2020-01-02", equity: 100 },
      { date: "2020-01-03", equity: 110 },
      { date: "2020-02-03", equity: 231 },
    ];
    const m = computeMetrics(c, 100, [{ date: "2020-02-03", amount: 100 }]);
    expect(m.final).toBe(231);
    expect(m.totalContributed).toBe(200);
    expect(m.totalReturnPct).toBeCloseTo(21, 6); // 1.1*1.1-1 (입금 자본은 수익에서 제외)
    expect(m.mdd).toBeCloseTo(0, 6);
  });

  it("입금으로 인한 상승은 수익 아님 — 입금 후 하락은 TWR 지수 기준 낙폭", () => {
    // day1 입금100 후 하락: base 200 → equity 180 (-10%) → TWR index 0.9
    const c: EquityPoint[] = [
      { date: "2020-01-02", equity: 100 },
      { date: "2020-02-02", equity: 180 },
    ];
    const m = computeMetrics(c, 100, [{ date: "2020-02-02", amount: 100 }]);
    expect(m.totalReturnPct).toBeCloseTo(-10, 6);
    expect(m.mdd).toBeCloseTo(-10, 6);
  });

  it("contributions 미지정/빈배열이면 기존 동작과 동일(회귀)", () => {
    const c = curve([100, 150, 130]);
    expect(computeMetrics(c, 100, undefined)).toEqual(computeMetrics(c, 100));
    expect(computeMetrics(c, 100, [])).toEqual(computeMetrics(c, 100));
  });

  it("원금 0 + 적립식(순수 적립) 도 TWR 계산됨 (원금 0 이라고 0% 반환하면 버그)", () => {
    // day0 자산 0(미투자) → day1 입금 100 → day2 +10% = 110
    const c: EquityPoint[] = [
      { date: "2020-01-02", equity: 0 },
      { date: "2020-02-03", equity: 100 },
      { date: "2020-03-03", equity: 110 },
    ];
    const m = computeMetrics(c, 0, [{ date: "2020-02-03", amount: 100 }]);
    expect(m.final).toBe(110);
    expect(m.totalContributed).toBe(100);
    expect(m.totalReturnPct).toBeCloseTo(10, 6); // 입금 자본 제거한 TWR = +10%
  });

  // 연환산 변동성 — 위험을 수익과 함께 봐야 "얼마나 흔들리며 벌었나" 를 알 수 있다.
  describe("연환산 변동성", () => {
    it("한 줄로 오르면 0 — 흔들림이 없다", () => {
      const m = computeMetrics(curve([100, 110, 121, 133.1]), 100);
      expect(m.volatility).toBeCloseTo(0, 6);
    });

    it("일간 표준편차 × √252 (%)", () => {
      // 하루 +10%, 하루 -10% 를 번갈아 — 일간수익 {0.1, -0.1, 0.1, ...}
      const eqs = [100];
      for (let i = 1; i <= 8; i++) eqs.push(i % 2 === 1 ? eqs[i - 1] * 1.1 : eqs[i - 1] * 0.9);
      const m = computeMetrics(curve(eqs), 100);

      const rets = eqs.slice(1).map((v, i) => v / eqs[i] - 1);
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const sd = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1));
      expect(m.volatility).toBeCloseTo(sd * Math.sqrt(252) * 100, 6);
    });

    it("많이 흔들릴수록 크다", () => {
      const 잔잔 = computeMetrics(curve([100, 101, 100, 101, 100, 101]), 100);
      const 요동 = computeMetrics(curve([100, 130, 100, 130, 100, 130]), 100);
      expect(요동.volatility).toBeGreaterThan(잔잔.volatility);
    });

    it("하루치뿐이면 0 — 표준편차를 낼 수 없다", () => {
      expect(computeMetrics(curve([100, 120]), 100).volatility).toBe(0);
    });

    it("항상 0 이상 — 음수 변동성은 없다", () => {
      for (const eqs of [[100, 50, 70, 30], [100, 100, 100], [100, 200, 50]]) {
        expect(computeMetrics(curve(eqs), 100).volatility).toBeGreaterThanOrEqual(0);
      }
    });

    it("적립식이면 TWR 기준 — 입금이 변동성으로 잡히지 않는다", () => {
      // 자산이 100→200 으로 뛰어도 그게 전부 입금이면 흔들린 것이 아니다.
      const m = computeMetrics(
        curve([100, 200, 200]),
        100,
        [{ date: "1", amount: 100 }],
      );
      expect(m.volatility).toBeCloseTo(0, 6);
    });
  });
});

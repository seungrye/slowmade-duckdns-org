import { describe, it, expect } from "vitest";
import { runValueRebalancingBacktest } from "./value-rebalancing";
import { computeMetrics } from "./metrics";
import tqqq from "./__fixtures__/tqqq-2011-2020.json";
import type { Bar } from "./types";

/**
 * 원문 백테스트 재현 (#345).
 *
 * 라오어 「VR 5.0 상승률 수치별 비교 백테스트」의 표를 우리 구현이 재현하는지 본다.
 * 조건: **거치식** · TQQQ · 2011~2020 · 밴드 ±15% (원문 "이 수치는 모두 거치식VR 기준").
 *
 * 이 테스트가 이 저장소에서 가장 강한 검증이다 — 수식 한 줄씩 읽는 것보다, 10년치 실제
 * 데이터로 공개된 숫자를 맞히는 쪽이 확실하다.
 *
 * ── 왜 오차를 허용하나 ──────────────────────────────────────────────────
 *
 * 원문은 **1주씩 지정가 사다리**로 장중 체결하는데(원문 3장 매수표), 우리 백테스트는 종가에
 * 한 번에 체결한다. 그래서 매수가 더 비싸고 매도가 더 싸다 → Pool 을 더 쓴다 → P/V 가 낮다
 * → 상승률이 작다 → 수익↓·낙폭↑. **네 지표가 전부 이 한 가지로 설명되고 방향도 일관된다.**
 *
 * 즉 우리 백테스트는 **일관되게 보수적으로 과소평가**한다. 사다리를 구현하면 좁혀질 것이다.
 * 그때까지 이 오차 범위가 "설명 가능한 크기" 안에 있는지를 지킨다 — 갑자기 벌어지면 수식이
 * 어딘가 틀어진 것이다.
 */

const bars: Bar[] = (tqqq.dates as string[]).map((date, i) => {
  const close = (tqqq.closes as number[])[i];
  return { date, open: close, high: close, low: close, close };
});

// 원문 표 (거치식·TQQQ·2011~2020·±15%)
const 원문 = [
  { G: 10, cagr: 49.47, mdd: -58.41, pv: 0.1521 },
  { G: 20, cagr: 46.16, mdd: -55.72, pv: 0.2725 },
  { G: 30, cagr: 44.12, mdd: -52.48, pv: 0.3780 },
  { G: 40, cagr: 41.86, mdd: -50.03, pv: 0.4672 },
];

const PRINCIPAL = 100_000;

function run(G: number) {
  const r = runValueRebalancingBacktest({ ticker: "TQQQ", bars }, {
    principal: PRINCIPAL, gradient: G, bandPct: 0.15, poolLimitPct: 0.5,
    cycleDays: 10, initStockRatio: 0.85,
  });
  const m = computeMetrics(r.equityCurve, PRINCIPAL);
  // P/V = Pool / V. equity = 주식 + Pool, vrBand.stock = 주식.
  const pv = r.vrBand!.map((b, i) => (b.v > 0 ? (r.equityCurve[i].equity - b.stock) / b.v : 0));
  return { ...m, pv: pv.reduce((s, v) => s + v, 0) / pv.length };
}

describe("원문 백테스트 재현 — 거치식 TQQQ 2011~2020", () => {
  it("데이터가 원문과 같다 — TQQQ 올인 MDD −69.92%", () => {
    const 올인 = computeMetrics(
      bars.map((b) => ({ date: b.date, equity: (PRINCIPAL / bars[0].close) * b.close })), PRINCIPAL);
    // 이게 안 맞으면 종목·기간·분할조정이 원문과 다른 것이라 아래 비교가 무의미해진다.
    expect(올인.mdd).toBeCloseTo(-69.92, 1);
    expect(올인.cagr).toBeCloseTo(49.68, 0);
  });

  it.each(원문)("G=$G — CAGR·MDD·P/V 가 원문 근처", ({ G, cagr, mdd, pv }) => {
    const got = run(G);
    // 사다리 미구현으로 우리가 낮다. 3%p 이상 벌어지면 다른 원인이 생긴 것이다.
    expect(Math.abs(got.cagr - cagr), `CAGR ${got.cagr.toFixed(2)} vs ${cagr}`).toBeLessThan(3);
    expect(Math.abs(got.mdd - mdd), `MDD ${got.mdd.toFixed(2)} vs ${mdd}`).toBeLessThan(3);
    expect(Math.abs(got.pv - pv), `P/V ${got.pv.toFixed(4)} vs ${pv}`).toBeLessThan(0.03);
  });

  it("차이의 방향이 일관된다 — 우리가 수익 낮고·낙폭 크고·현금 얇다", () => {
    // 방향이 뒤섞이면 사다리 말고 다른 것이 틀어졌다는 신호다.
    for (const e of 원문) {
      const got = run(e.G);
      expect(got.cagr, `G=${e.G} CAGR`).toBeLessThan(e.cagr);
      expect(got.mdd, `G=${e.G} MDD`).toBeLessThan(e.mdd);
      expect(got.pv, `G=${e.G} P/V`).toBeLessThan(e.pv);
    }
  });

  it("G 를 키우면 수익·위험이 함께 내려가고 위험이 더 빨리 내려간다 (원문 5.2)", () => {
    const g10 = run(10);
    const g40 = run(40);
    expect(g40.cagr).toBeLessThan(g10.cagr);
    expect(g40.mdd).toBeGreaterThan(g10.mdd);       // 낙폭이 얕아짐
    expect(g40.pv).toBeGreaterThan(g10.pv);         // 현금을 두껍게
    // "위험이 더 빨리 내려간다" — 낙폭이 줄어든 폭이 수익이 줄어든 폭보다 크다.
    // (측정: G10→G40 에서 CAGR −7.07%p, MDD +9.48%p)
    expect(Math.abs(g10.mdd) - Math.abs(g40.mdd)).toBeGreaterThan(g10.cagr - g40.cagr);
  });
});

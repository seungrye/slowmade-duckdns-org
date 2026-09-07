import { describe, it, expect } from "vitest";
import { runValueRebalancingBacktest } from "./value-rebalancing";
import { computeMetrics } from "./metrics";
import tqqq from "./__fixtures__/tqqq-2011-2020.json";
import type { Bar } from "./types";

/**
 * Reproducing the source's backtest (#345).
 *
 * It checks our implementation against the table in Laoer's "VR 5.0 growth-rate comparison backtest".
 * Conditions: **lump sum**, TQQQ, 2011-2020, band +/-15%, **the basic formula**
 * (the source says "these figures are all lump-sum VR"; on the formula see #358 - this table is from the 5.0 era).
 *
 * **This agreement is not proof the formula is right.** Measured, our G = 10 result sits closer to the source's
 * G = 20 (see "it cannot tell G apart" below) - the values are merely nearby, not precise enough to distinguish G.
 * Do not over-trust it.
 *
 * It is kept because touching the formula pushes it **visibly** off. Measured:
 *   removing the Pool/G term (G -> infinity)  CAGR 47.4% -> 19.3%,  P/V 0.15 -> 2.42
 *   G = 1 (the whole Pool)                    CAGR 47.4% -> 50.3%,  P/V 0.15 -> 0.02
 * Whereas swinging a parameter the source leaves open (the initial stock:Pool) from 50:50 to 100:0 moves it 0.16pp.
 * In other words, **the formula dominates the result, not the free parameters.**
 *
 * ── Why an error band is allowed ──────────────────────────────────────────
 *
 * The source fills intraday through a **one-share limit ladder** (its chapter 3 buy table), while our backtest fills
 * once at the close. So we buy dearer and sell cheaper -> we spend more Pool -> P/V is lower -> the growth rate is
 * smaller -> lower return, deeper drawdown. **All four metrics follow from that one thing, consistently.**
 *
 * That is, our backtest **understates consistently and conservatively**. Implementing the ladder should narrow it.
 * Until then this guards that the gap stays within an explainable size - a sudden widening means the maths slipped.
 *
 * ── What must not be done ────────────────────────────────────────────────
 *
 * Setting the cycle to **5 days** instead of 10 brings CAGR to 49.25%, within 0.22pp of the source's 49.47%.
 * Do not tune it that way - the source clearly says "two weeks", and 5 days fits only because it **happens to cancel
 * out the fill model's disadvantage**. Bending the spec to match a number empties this test of meaning.
 */

const bars: Bar[] = (tqqq.dates as string[]).map((date, i) => {
  const close = (tqqq.closes as number[])[i];
  return { date, open: close, high: close, low: close, close };
});

// The source's table (lump sum, TQQQ, 2011-2020, +/-15%)
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
    // **Pinned to the basic formula** (#358). This table is from the VR 5.0-era document, and the skill formula's
    // equation only appeared in the 2025 lecture write-up. Running the default (skill) would compare results from two
    // different formulas and empty this reproduction of meaning.
    //
    // Run with the skill formula, CAGR actually gets **closer** to the source (47.41 -> 48.78 against 49.47) while MDD
    // gets **further** (-61.17 -> -63.46 against -58.41). The document never says which formula built the 5.0 table, so
    // the discrepancy cannot be blamed on either - and the missing ladder is tangled up in it too (#345). So no
    // judgement is made here; only the conditions are matched.
    formula: "basic",
  });
  const m = computeMetrics(r.equityCurve, PRINCIPAL);
  // P/V = Pool / V. equity = stock + Pool, and vrBand.stock is the stock.
  const pv = r.vrBand!.map((b, i) => (b.v > 0 ? (r.equityCurve[i].equity - b.stock) / b.v : 0));
  return { ...m, pv: pv.reduce((s, v) => s + v, 0) / pv.length };
}

describe("원문 백테스트 재현 — 거치식 TQQQ 2011~2020", () => {
  it("데이터가 원문과 같다 — TQQQ 올인 MDD −69.92%", () => {
    const 올인 = computeMetrics(
      bars.map((b) => ({ date: b.date, equity: (PRINCIPAL / bars[0].close) * b.close })), PRINCIPAL);
    // If this does not match, the symbol, period or split adjustment differs from the source and the comparisons below are meaningless.
    expect(올인.mdd).toBeCloseTo(-69.92, 1);
    expect(올인.cagr).toBeCloseTo(49.68, 0);
  });

  it.each(원문)("G=$G — CAGR·MDD·P/V 가 원문 근처", ({ G, cagr, mdd, pv }) => {
    const got = run(G);
    // We come in lower because the ladder is not implemented. A gap of 3pp or more means something else has changed.
    expect(Math.abs(got.cagr - cagr), `CAGR ${got.cagr.toFixed(2)} vs ${cagr}`).toBeLessThan(3);
    expect(Math.abs(got.mdd - mdd), `MDD ${got.mdd.toFixed(2)} vs ${mdd}`).toBeLessThan(3);
    expect(Math.abs(got.pv - pv), `P/V ${got.pv.toFixed(4)} vs ${pv}`).toBeLessThan(0.03);
  });

  it("차이의 방향이 일관된다 — 우리가 수익 낮고·낙폭 크고·현금 얇다", () => {
    // Mixed directions would signal that something other than the ladder has slipped.
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
    expect(g40.mdd).toBeGreaterThan(g10.mdd);       // the drawdown gets shallower
    expect(g40.pv).toBeGreaterThan(g10.pv);         // with a thicker cash buffer
    // "risk falls faster" - the drawdown shrinks by more than the return does.
    // (measured: from G10 to G40, CAGR -7.07pp and MDD +9.48pp)
    expect(Math.abs(g10.mdd) - Math.abs(g40.mdd)).toBeGreaterThan(g10.cagr - g40.cagr);
  });

  /**
   * Pinning this test's limit - **our results cannot tell which G the source used.**
   *
   * We are consistently about 2pp low while one step of G is worth 2-3pp, so our G = 10 lands closer to the source's
   * G = 20. That is why "it reproduces the source's table" must not be read as "the formula is proven right".
   * Implementing the ladder will close the gap and make this test fail - and then it should be deleted.
   */
  it("한계: 우리 결과로 원문의 G 를 가려내지는 못한다", () => {
    const 가장가까운 = (our: number) =>
      원문.reduce((b, e) => (Math.abs(our - e.cagr) < Math.abs(our - b.cagr) ? e : b), 원문[0]).G;

    // Our G = 10 is closer to the source's /20 than its /10.
    expect(가장가까운(run(10).cagr)).toBe(20);
    expect(가장가까운(run(20).cagr)).toBe(30);
  });

  it("공식을 건드리면 눈에 띄게 벗어난다 — 자유 파라미터로는 못 메운다", () => {
    const 정상 = run(10);
    // Removing the Pool/G term (G -> infinity) makes it an entirely different strategy.
    const 항없음 = run(1e9);
    expect(정상.cagr - 항없음.cagr).toBeGreaterThan(20);
    expect(항없음.pv).toBeGreaterThan(2);

    // Whereas swinging a parameter the source leaves open barely moves it.
    const 반반 = runValueRebalancingBacktest({ ticker: "TQQQ", bars }, {
      principal: PRINCIPAL, gradient: 10, bandPct: 0.15, poolLimitPct: 0.5,
      cycleDays: 10, initStockRatio: 0.5, formula: "basic", // 위 run() 과 같은 조건으로
    });
    const m = computeMetrics(반반.equityCurve, PRINCIPAL);
    expect(Math.abs(m.cagr - 정상.cagr)).toBeLessThan(1);
  });
});

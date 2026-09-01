import { describe, it, expect } from "vitest";
import { runValueRebalancingBacktest } from "./value-rebalancing";
import { computeMetrics } from "./metrics";
import tqqq from "./__fixtures__/tqqq-2011-2020.json";
import type { Bar } from "./types";

/**
 * 원문 백테스트 재현 (#345).
 *
 * 라오어 「VR 5.0 상승률 수치별 비교 백테스트」의 표를 우리 구현이 재현하는지 본다.
 * 조건: **거치식** · TQQQ · 2011~2020 · 밴드 ±15% · **기본공식**
 * (원문 "이 수치는 모두 거치식VR 기준". 공식은 #358 참조 — 이 표는 5.0 시절 것이다).
 *
 * ⚠️ **이 일치는 "공식이 맞다"의 증명이 아니다.** 실제로 측정해 보니 우리 G=10 결과는 원문
 * G=20 쪽에 더 가깝다(아래 "G 를 가려내지는 못한다" 참조) — 값이 근처에 있을 뿐, G 를
 * 구분할 만큼 정밀하지 않다. 과신하지 말 것.
 *
 * 그래도 남겨 두는 이유는, 공식을 건드리면 **눈에 띄게** 벗어나기 때문이다. 측정:
 *   Pool/G 항 제거(G→∞)  CAGR 47.4% → 19.3%,  P/V 0.15 → 2.42
 *   G=1 (Pool 전액)       CAGR 47.4% → 50.3%,  P/V 0.15 → 0.02
 * 반면 원문 미규정 파라미터(초기 주식:Pool)를 50:50~100:0 으로 흔들어도 0.16%p 뿐이다.
 * 즉 **결과를 지배하는 것은 공식이지 자유 파라미터가 아니다.**
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
 *
 * ── 하면 안 되는 것 ────────────────────────────────────────────────────
 *
 * 사이클을 10일 대신 **5일**로 두면 CAGR 49.25% 로 원문(49.47%)에 0.22%p 까지 붙는다.
 * 그렇게 맞추면 안 된다 — 원문은 분명히 "2주"이고, 5일이 잘 맞는 것은 **체결모델의 불리함과
 * 우연히 상쇄**되기 때문이다. 숫자를 맞추려고 규격을 비트는 순간 이 테스트는 뜻을 잃는다.
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
    // **기본공식으로 고정한다** (#358). 이 표는 VR 5.0 시절 문서의 것이고, 실력공식
    // 수식은 2025 강의 정리에서야 나왔다. 기본값(실력)으로 돌리면 서로 다른 공식의
    // 결과를 비교하게 돼 이 재현의 뜻이 사라진다.
    //
    // 실제로 실력공식으로 돌리면 CAGR 은 원문에 **가까워지고**(47.41→48.78, 원문 49.47)
    // MDD 는 **멀어진다**(−61.17→−63.46, 원문 −58.41). 5.0 표가 어느 공식으로 만들어진
    // 것인지 문서에 없어서 이 어긋남을 어느 쪽 탓으로도 돌릴 수 없다 — 사다리 미구현이
    // 겹쳐 있기도 하다(#345). 그래서 여기서는 판단하지 않고 조건만 맞춘다.
    formula: "basic",
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

  /**
   * 이 테스트의 한계를 못 박는다 — **우리 결과로는 원문의 G 를 가려낼 수 없다.**
   *
   * 우리가 일관되게 ~2%p 낮은데 G 한 칸 간격이 2~3%p 라, 우리 G=10 이 원문 G=20 에 더
   * 가깝다. "원문 표를 재현한다" 를 "공식이 옳음이 증명됐다" 로 읽으면 안 되는 이유다.
   * 사다리를 구현해 갭이 줄면 이 테스트는 실패할 것이고, 그때 지워야 한다.
   */
  it("한계: 우리 결과로 원문의 G 를 가려내지는 못한다", () => {
    const 가장가까운 = (our: number) =>
      원문.reduce((b, e) => (Math.abs(our - e.cagr) < Math.abs(our - b.cagr) ? e : b), 원문[0]).G;

    // 우리 G=10 은 원문 /10 이 아니라 /20 에 가깝다.
    expect(가장가까운(run(10).cagr)).toBe(20);
    expect(가장가까운(run(20).cagr)).toBe(30);
  });

  it("공식을 건드리면 눈에 띄게 벗어난다 — 자유 파라미터로는 못 메운다", () => {
    const 정상 = run(10);
    // Pool/G 항을 없애면(G→∞) 전혀 다른 전략이 된다.
    const 항없음 = run(1e9);
    expect(정상.cagr - 항없음.cagr).toBeGreaterThan(20);
    expect(항없음.pv).toBeGreaterThan(2);

    // 반면 원문 미규정 파라미터를 크게 흔들어도 거의 안 움직인다.
    const 반반 = runValueRebalancingBacktest({ ticker: "TQQQ", bars }, {
      principal: PRINCIPAL, gradient: 10, bandPct: 0.15, poolLimitPct: 0.5,
      cycleDays: 10, initStockRatio: 0.5, formula: "basic", // 위 run() 과 같은 조건으로
    });
    const m = computeMetrics(반반.equityCurve, PRINCIPAL);
    expect(Math.abs(m.cagr - 정상.cagr)).toBeLessThan(1);
  });
});

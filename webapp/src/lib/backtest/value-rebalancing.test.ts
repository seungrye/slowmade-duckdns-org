import { describe, it, expect } from "vitest";
import { updateVBasic, bandOf, rebalanceShares, runValueRebalancingBacktest } from "./value-rebalancing";
import type { Bar } from "./types";
import type { RotationCandidate } from "./rotation";

// ── 순수 헬퍼 ──
describe("VR updateVBasic — V₂ = V₁ + Pool/G + CF", () => {
  it("원문 예시: V9000·Pool1000·G10·CF250 → 9350", () => {
    expect(updateVBasic(9000, 1000, 10, 250)).toBe(9350);
  });
  it("거치(CF=0): V += Pool/G", () => {
    expect(updateVBasic(9000, 1000, 10, 0)).toBe(9100);
  });
  it("Pool=0 이면 V 정체(상승률=1, 존버 한계)", () => {
    expect(updateVBasic(9000, 0, 10, 0)).toBe(9000);
  });
  it("인출(CF<0): V₂ = V₁ + Pool/G − 인출", () => {
    expect(updateVBasic(9000, 1000, 20, -100)).toBe(8950); // 9000+50-100
  });
});

describe("VR bandOf — [V(1−b), V(1+b)]", () => {
  it("V=8500, b=0.15 → [7225, 9775]", () => {
    expect(bandOf(8500, 0.15)).toEqual({ low: 7225, high: 9775 });
  });
});

describe("VR rebalanceShares — 밴드 복귀 수량", () => {
  const band = { low: 7225, high: 9775 };
  it("평가금 > 상단 → 매도(음수)", () => {
    // qty85·price130 → 평가금 11050 > 9775 → floor((11050-9775)/130)=9 매도
    expect(rebalanceShares({ qty: 85, price: 130, ...band, buyBudget: 1000, pool: 1500, fee: 0 })).toBe(-9);
  });
  it("평가금 < 하단 → 매수(양수), 하단까지", () => {
    // qty85·price80 → 평가금 6800 < 7225 → floor(425/80)=5, 한도/풀 여유 충분
    expect(rebalanceShares({ qty: 85, price: 80, ...band, buyBudget: 750, pool: 1500, fee: 0 })).toBe(5);
  });
  it("매수는 사이클 한도(buyBudget)로 컷", () => {
    // 원하는 5주지만 buyBudget 200 → floor(200/80)=2 주만
    expect(rebalanceShares({ qty: 85, price: 80, ...band, buyBudget: 200, pool: 1500, fee: 0 })).toBe(2);
  });
  it("밴드 안이면 0(무행동)", () => {
    expect(rebalanceShares({ qty: 85, price: 100, ...band, buyBudget: 750, pool: 1500, fee: 0 })).toBe(0);
  });
});

// ── 러너 ──
const DM = (i: number) => `2020-${String(Math.floor(i / 20) + 1).padStart(2, "0")}-${String((i % 20) + 1).padStart(2, "0")}`;
const mk = (closes: number[]): Bar[] => closes.map((c, i) => ({ date: DM(i), open: c, high: c, low: c, close: c }));
const cand = (closes: number[]): RotationCandidate => ({ ticker: "TQQQ", bars: mk(closes) });
const CFG = { principal: 10000, gradient: 10, bandPct: 0.15, poolLimitPct: 0.5, cycleDays: 5, initStockRatio: 0.85 };
const heldQty = (r: ReturnType<typeof runValueRebalancingBacktest>) =>
  r.trades.filter((t) => t.side === "buy").reduce((s, t) => s + t.qty, 0) -
  r.trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.qty, 0);

describe("runValueRebalancingBacktest — 러너", () => {
  it("초기 진입: 85:15 분할, 첫 매수 1건", () => {
    const r = runValueRebalancingBacktest(cand(Array(30).fill(100)), CFG);
    const first = r.trades[0];
    expect(first).toMatchObject({ side: "buy", price: 100, qty: 85 }); // floor(8500/100)
  });

  it("상승장 — 매도로 자산 증가·보유수량 감소", () => {
    const r = runValueRebalancingBacktest(cand(Array.from({ length: 40 }, (_, i) => 100 + i * 3)), CFG);
    expect(r.trades.filter((t) => t.side === "sell").length).toBeGreaterThan(0);
    expect(heldQty(r)).toBeLessThan(85);
    expect(r.equityCurve.at(-1)!.equity).toBeGreaterThan(10000);
  });

  it("하락장 — 물타기 매수로 보유수량 증가(한도 내)", () => {
    const r = runValueRebalancingBacktest(cand(Array.from({ length: 40 }, (_, i) => 100 - i * 1.5)), CFG);
    expect(r.trades.filter((t) => t.side === "buy").length).toBeGreaterThan(1);
    expect(heldQty(r)).toBeGreaterThan(85);
  });

  it("인출(CF<0) — 사이클마다 음수 flow 기록, 순유출", () => {
    const r = runValueRebalancingBacktest(cand(Array.from({ length: 30 }, (_, i) => 100 + i)), { ...CFG, cashflow: -200 });
    expect(r.contributions!.length).toBeGreaterThan(0);
    expect(r.contributions!.every((c) => c.amount === -200)).toBe(true);
    expect(r.totalContributed!).toBeLessThan(10000);
  });

  it("feeRate 미지정/0 동일(회귀)", () => {
    const bars = cand(Array.from({ length: 30 }, (_, i) => 100 + i * 2));
    const a = runValueRebalancingBacktest(bars, CFG);
    const b = runValueRebalancingBacktest(bars, { ...CFG, feeRate: 0 });
    expect(b.trades).toEqual(a.trades);
    expect(b.equityCurve).toEqual(a.equityCurve);
  });
});

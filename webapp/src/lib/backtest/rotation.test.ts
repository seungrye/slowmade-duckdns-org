import { describe, it, expect } from "vitest";
import { runRotationBacktest } from "./rotation";
import type { Bar } from "./types";

const D = (i: number) => `2020-01-${String(i + 1).padStart(2, "0")}`;
const mk = (closes: number[]): Bar[] =>
  closes.map((c, i) => ({ date: D(i), open: c, high: c, low: c, close: c }));

// The signal stays above SMA3 (regime on) by default. cfg: sma 3, band 0, mom 2, rebalance 2.
const CFG = { principal: 10000, smaPeriod: 3, bandPct: 0, momDays: 2, rebalanceDays: 2 };

describe("rotation_v1 — 듀얼 모멘텀 로테이션", () => {
  it("레짐 온 진입 시 모멘텀 1위 종목을 산다", () => {
    const signal = mk([10, 10, 10, 12, 13]); // above the SMA from d4
    const A = mk([100, 100, 100, 100, 100]); // 0% momentum
    const B = mk([100, 100, 110, 120, 130]); // strong momentum
    const r = runRotationBacktest(
      [{ ticker: "A", bars: A }, { ticker: "B", bars: B }], signal, CFG);
    const first = r.trades[0];
    expect(first.side).toBe("buy");
    expect(first.ticker).toBe("B"); // picks the leader
  });

  it("재평가 주기에 1위가 바뀌면 같은 날 종가로 교체한다", () => {
    // B leads early, then A overtakes it. Re-evaluated every 2 days.
    // The signal must stay above the SMA (an uptrend) for the re-evaluation counter to advance (at the band boundary it only holds).
    const signal = mk([10, 10, 10, 12, 13, 14, 15, 16]);
    const A = mk([100, 100, 100, 100, 120, 150, 190, 240]); // a late surge
    const B = mk([100, 100, 110, 120, 121, 121, 121, 121]); // stalled
    const r = runRotationBacktest(
      [{ ticker: "A", bars: A }, { ticker: "B", bars: B }], signal, CFG);
    const switchSell = r.trades.find((t) => t.side === "sell" && t.ticker === "B");
    const switchBuy = r.trades.find((t) => t.side === "buy" && t.ticker === "A");
    expect(switchSell).toBeDefined(); // B is liquidated
    expect(switchBuy).toBeDefined(); // switched to A
    expect(switchSell!.date).toBe(switchBuy!.date); // switched the same day
  });

  it("레짐 오프(시그널<SMA−밴드)면 리밸런스 주기와 무관하게 즉시 전량 현금", () => {
    const signal = mk([10, 10, 10, 12, 5, 5, 5, 5]); // d5 crashes -> the regime turns off
    const A = mk([100, 100, 110, 120, 125, 130, 135, 140]); // even with the symbol itself fine
    const r = runRotationBacktest([{ ticker: "A", bars: A }], signal, { ...CFG, momDays: 1 });
    const exit = r.trades.find((t) => t.side === "sell");
    expect(exit).toBeDefined();
    expect(exit!.date).toBe(D(4)); // liquidated on the crash day (no waiting for the cycle)
    expect(r.trades.filter((t) => t.date > D(4) && t.side === "buy")).toHaveLength(0); // no re-entry (the regime stays off)
  });

  it("from 이전은 워밍업만 하고 매매하지 않는다", () => {
    const signal = mk([10, 10, 10, 12, 13, 14]);
    const A = mk([100, 100, 110, 120, 130, 140]);
    const r = runRotationBacktest([{ ticker: "A", bars: A }], signal, { ...CFG, momDays: 1, from: D(5) });
    expect(r.trades.every((t) => t.date >= D(5))).toBe(true);
    expect(r.equityCurve[0].date).toBe(D(5)); // the curve covers the trading window only
  });
});

// ── Candidate auto-selection (rotation-pool) - the same vectors as Python's rotation_pool / test_rotation_pool ──

import { liquidityMetric, selectPool, type SeedEntry } from "./rotation-pool";

const SEED: SeedEntry[] = [
  { ticker: "AAA", group: "g1" },
  { ticker: "BBB", group: "g2" },
  { ticker: "CCC", group: "g1" }, // AAA 와 같은 지수 그룹
  { ticker: "DDD", group: "g3" },
  { ticker: "EEE", group: "g4" },
];

describe("rotation-pool — 후보 자동선발", () => {
  it("liquidityMetric: 창 미달/0 은 null, 최근 창만 반영", () => {
    expect(liquidityMetric(Array(19).fill(100), 20)).toBeNull();
    expect(liquidityMetric(Array(25).fill(100), 20)).toBe(100);
    expect(liquidityMetric(Array(20).fill(0), 20)).toBeNull();
    expect(liquidityMetric([...Array(20).fill(0), ...Array(20).fill(50)], 20)).toBe(50);
  });

  it("selectPool: 거래대금 내림차순 선발", () => {
    const m = { AAA: 10, BBB: 40, CCC: 30, DDD: 20, EEE: 5 };
    expect(selectPool(SEED, m, 4)).toEqual(["BBB", "CCC", "DDD", "EEE"]);
  });

  it("selectPool: 기초지수 그룹당 1종", () => {
    const m = { AAA: 100, BBB: 90, CCC: 95, DDD: 1, EEE: 2 };
    expect(selectPool(SEED, m, 4)).toEqual(["AAA", "BBB", "EEE", "DDD"]);
  });

  it("selectPool: 무데이터 시드는 시드 순서로 충원", () => {
    const m = { AAA: null, BBB: 40, CCC: null, DDD: null, EEE: null };
    expect(selectPool(SEED, m, 4)).toEqual(["BBB", "AAA", "DDD", "EEE"]);
    expect(selectPool(SEED, {}, 4)).toEqual(["AAA", "BBB", "DDD", "EEE"]);
  });
});

describe("rotation_v1 — 자동선발 모드(autoSeed)", () => {
  // The same scenario as Python's tests/test_rotation_pool.py integration case:
  // HOT is the momentum leader but illiquid and a group duplicate -> excluded from the pool -> never bought.
  const mkv = (closeFn: (i: number) => number, volume: number, n = 60): Bar[] =>
    Array.from({ length: n }, (_, i) => {
      const c = closeFn(i);
      const date = `2025-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
      return { date, open: c, high: c, low: c, close: c, volume };
    });

  it("풀 밖 후보(저유동·그룹중복)는 모멘텀 1위여도 매수하지 않는다", () => {
    const seed: SeedEntry[] = [
      { ticker: "LIQ", group: "g1" }, { ticker: "HOT", group: "g1" }, { ticker: "ALT", group: "g2" }];
    const cands = [
      { ticker: "LIQ", bars: mkv((i) => 100 + i * 0.1, 1_000_000) },
      { ticker: "HOT", bars: mkv((i) => 100 + i * 5.0, 1) },
      { ticker: "ALT", bars: mkv(() => 100, 500_000) },
    ];
    const signal = mkv((i) => 100 + i, 0);
    const r = runRotationBacktest(cands, signal, {
      principal: 10000, smaPeriod: 10, bandPct: 0, momDays: 10, rebalanceDays: 5,
      autoSeed: seed, poolSize: 2 });
    expect(r.poolLog?.length).toBeGreaterThan(0);
    expect(r.poolLog![0]).toContain("LIQ");
    expect(r.poolLog![0]).not.toContain("HOT");
    const buys = r.trades.filter((t) => t.side === "buy");
    expect(buys.length).toBeGreaterThan(0);
    expect(buys.every((t) => t.ticker !== "HOT")).toBe(true);
    expect(buys[0].ticker).toBe("LIQ"); // the momentum leader within the pool
  });

  it("autoSeed 없으면(수동) 기존과 동일 — HOT 매수, poolLog 없음", () => {
    const cands = [
      { ticker: "LIQ", bars: mkv((i) => 100 + i * 0.1, 1_000_000) },
      { ticker: "HOT", bars: mkv((i) => 100 + i * 5.0, 1) },
    ];
    const signal = mkv((i) => 100 + i, 0);
    const r = runRotationBacktest(cands, signal, {
      principal: 10000, smaPeriod: 10, bandPct: 0, momDays: 10, rebalanceDays: 5 });
    const buys = r.trades.filter((t) => t.side === "buy");
    expect(buys[0].ticker).toBe("HOT");
    expect(r.poolLog).toBeUndefined();
  });
});

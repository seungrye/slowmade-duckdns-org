// Dual momentum (GEM, Gary Antonacci) - relative momentum (the leader among candidates) plus absolute momentum
// (held only while the leader beats the defensive asset, otherwise moved into it). Judged each re-evaluation cycle, all in or out (one symbol), compounding.
// Unlike rotation there is no SMA regime filter, and instead of "cash" it holds a defensive asset such as bonds.

import { momentum, compositeMomentum } from "@/lib/trading/strategies";
import type { BacktestResult, BtTrade, EquityPoint, DualMomentumV1Config } from "./types";
import type { RotationCandidate } from "./rotation";

/** The pure decision: the relative-momentum leader versus the defensive asset's absolute momentum. target is a candidate or the defensive ticker. */
export function dualMomentumDecide(args: {
  candidates: string[];
  candMom: Record<string, number | null>;
  defensiveTicker: string;
  defensiveMom: number | null;
}): { target: string; reason: string } {
  let best: string | null = null;
  let bestMom = -Infinity;
  for (const s of args.candidates) {
    const m = args.candMom[s];
    if (m !== null && m !== undefined && m > bestMom) { best = s; bestMom = m; }
  }
  const defMom = args.defensiveMom ?? -Infinity;
  if (best === null) return { target: args.defensiveTicker, reason: "후보 모멘텀 데이터 부족 → 방어자산" };
  if (bestMom <= defMom) {
    return { target: args.defensiveTicker,
             reason: `절대모멘텀 약함(1위 ${(bestMom * 100).toFixed(1)}% ≤ 방어 ${(defMom * 100).toFixed(1)}%) → ${args.defensiveTicker}` };
  }
  return { target: best, reason: `상대모멘텀 1위 ${best} (${(bestMom * 100).toFixed(1)}%)` };
}

/** Dual-momentum backtest. candidates are the risk assets, defensive the defensive asset (bonds and the like). The time axis is the defensive asset's daily bars. */
export function runDualMomentumBacktest(
  candidates: RotationCandidate[],
  defensive: RotationCandidate,
  cfg: DualMomentumV1Config,
): BacktestResult {
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const fee = cfg.feeRate && cfg.feeRate > 0 ? cfg.feeRate : 0;
  const all = [...candidates, defensive];
  const closeMaps = all.map((c) => new Map(c.bars.map((b) => [b.date, b.close])));
  const series: number[][] = all.map(() => []); // accumulate closes per asset in chronological order
  const idxOf = new Map(all.map((c, i) => [c.ticker, i]));
  const need = cfg.momLookbacks && cfg.momLookbacks.length ? Math.max(...cfg.momLookbacks) : cfg.momDays;
  const momOf = (i: number): number | null => {
    const closes = series[i].slice(-(need + 1)).reverse();
    return cfg.momLookbacks && cfg.momLookbacks.length ? compositeMomentum(closes, cfg.momLookbacks) : momentum(closes, cfg.momDays);
  };

  let cash = cfg.principal;
  let held: string | null = null; // the ticker held
  let qty = 0;
  let avg = 0;
  let sinceReb = 0;
  // Accumulating (a monthly deposit) - always invested, so it is added to the holding at once (no cash drag).
  const contribution = cfg.contribution && cfg.contribution > 0 ? cfg.contribution : 0;
  const contributions: { date: string; amount: number }[] = [];
  let prevMonth: string | null = null;

  const sell = (date: string, price: number) => {
    trades.push({ date, side: "sell", price, qty, pnl: (price - avg) * qty, roundNo: 0, ticker: held! });
    cash += price * qty * (1 - fee);
    held = null; qty = 0; avg = 0;
  };
  const buy = (date: string, ticker: string, price: number) => {
    const q = Math.floor(cash / (price * (1 + fee)));
    if (q < 1) return;
    trades.push({ date, side: "buy", price, qty: q, pnl: 0, roundNo: 0, ticker });
    cash -= price * q * (1 + fee);
    held = ticker; qty = q; avg = price;
  };
  // A cumulative top-up buy - averaging into the existing cost (buy overwrites, so accumulation uses this).
  const addBuy = (date: string, ticker: string, price: number, budget: number) => {
    const q = Math.floor(budget / (price * (1 + fee)));
    if (q < 1) return;
    trades.push({ date, side: "buy", price, qty: q, pnl: 0, roundNo: 0, ticker });
    avg = qty > 0 ? (avg * qty + price * q) / (qty + q) : price;
    cash -= price * q * (1 + fee);
    qty += q; held = ticker;
  };

  for (const bar of defensive.bars) {
    const date = bar.date;
    for (let i = 0; i < all.length; i++) { const c = closeMaps[i].get(date); if (c !== undefined) series[i].push(c); }
    const inRange = (!cfg.from || date >= cfg.from) && (!cfg.to || date <= cfg.to);
    if (!inRange) continue;

    // Accumulating: cash arrives at the month boundary (a rebalance buy absorbs it; otherwise it is added to the holding below).
    if (contribution > 0) {
      const ym = date.slice(0, 7);
      if (prevMonth !== null && ym !== prevMonth) { cash += contribution; contributions.push({ date, amount: contribution }); }
      prevMonth = ym;
    }

    if (held !== null) sinceReb++;
    if (held === null || sinceReb >= cfg.rebalanceDays) {
      const candMom: Record<string, number | null> = {};
      for (const c of candidates) candMom[c.ticker] = momOf(idxOf.get(c.ticker)!);
      const defMom = momOf(idxOf.get(defensive.ticker)!);
      const dec = dualMomentumDecide({ candidates: candidates.map((c) => c.ticker), candMom, defensiveTicker: defensive.ticker, defensiveMom: defMom });
      const tp = closeMaps[idxOf.get(dec.target)!].get(date);
      const heldClose = held !== null ? closeMaps[idxOf.get(held)!].get(date) : undefined;
      if (tp !== undefined && (held === null || heldClose !== undefined)) {
        if (dec.target !== held) {
          if (held !== null && heldClose !== undefined) sell(date, heldClose);
          buy(date, dec.target, tp);
        }
        sinceReb = 0;
      }
    }
    // Accumulating: on a day the rebalance did not buy (hold), idle cash is added to the holding at once. With 0 cash it is a no-op.
    if (contribution > 0 && held !== null) {
      const hc = closeMaps[idxOf.get(held)!].get(date);
      if (hc !== undefined) addBuy(date, held, hc, cash);
    }
    const cur = held !== null ? closeMaps[idxOf.get(held)!].get(date) : undefined;
    equityCurve.push({ date, equity: cash + (cur !== undefined ? qty * cur : qty * avg) });
  }
  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return {
    trades, equityCurve, totalPnl,
    ...(contribution > 0
      ? { contributions, totalContributed: cfg.principal + contributions.reduce((s, c) => s + c.amount, 0) }
      : {}),
  };
}

// Infinite buying V4.0 backtest - **one code path for backtest and live**.
// The day's order plan comes from v4PlanDay() in lib/trading/v4-plan.ts (the same function the live engine uses),
// and this only scores those orders with the LOC fill rules (exactly as live, where the close is unknown at order time):
//   buy LOC: close <= limit fills at the close / sell LOC: close >= limit fills at the close /
//   sell limit: high >= limit fills at the limit / MOC: fills at the close.
// The T and mode transition rules mirror Python's strategy/infinite_v4.InfiniteV4Simulator.

import { BIG_BUY_PCT, v4PlanDay } from "@/lib/trading/v4-plan";
import type { BacktestResult, Bar, BtTrade, EquityPoint } from "./types";

export interface InfiniteV4Config {
  principal: number;
  splits: number; // 20/30/40 (as the source recommends). star% and T's decay rate are tied to the split count.
  // V (the volatility coefficient, %) - the post-Tier-0 atomic factor. Per-symbol (TQQQ 15 / SOXL 20 / KODEX Leverage 8).
  // It drives the star% base, the final sell target (+V%) and the reverse exit line (-V%). Unset or 0 derives it per section 5.3.2.
  v?: number;
}

/** Source section 5.3.2 - derives the volatility coefficient V from sigma, the standard deviation of daily log returns.
 *  V is about 4 x sigma(%) (TQQQ sigma ~3.7% -> 15, SOXL sigma ~5.0% -> 20). Too few samples, or sigma = 0, falls back to 15 (TQQQ).
 *  Note: the source recalculates sigma quarterly over the last year, but the backtest computes V once from the whole
 *  loaded range (a coarse factor insensitive to V +/- 1 - rolling recalculation is out of scope, and this is a slight
 *  lookahead). The sigma -> V derivation is itself the source's own unverified inference (section 5.5). */
export function deriveVFromBars(bars: Bar[]): number {
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const p0 = bars[i - 1].close;
    const p1 = bars[i].close;
    if (p0 > 0 && p1 > 0) rets.push(Math.log(p1 / p0));
  }
  if (rets.length < 2) return 15;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  const sigmaPct = Math.sqrt(variance) * 100;
  const v = Math.round(4 * sigmaPct);
  return v > 0 ? v : 15;
}

/** T's decay multiplier on a reverse-mode sell = 1 - 1/(portions), where portions = splits/2 (derived in source 6.1.1).
 *  40 splits -> 0.95, 20 -> 0.90, 30 -> 0.9333. (The old ternary splits === 20 ? 0.9 : 0.95 mis-scored 30 splits.) */
export function revSellDecay(splits: number): number {
  return 1 - 1 / (splits / 2);
}

export function runInfiniteV4Backtest(bars: Bar[], cfg: InfiniteV4Config): BacktestResult {
  const { principal, splits } = cfg;
  const V = cfg.v && cfg.v > 0 ? cfg.v : deriveVFromBars(bars); // unset or 0 -> derived per section 5.3.2
  const planCfg = { splits, starBase: V, sellTarget: V / 100 }; // V alone drives star% and the final sell
  const REV_SELL_DECAY = revSellDecay(splits);
  const RECOVER_PCT = V / 100; // the reverse exit line, -V%

  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let qty = 0;
  let avg = 0;
  let T = 0;
  let cash = principal; // remaining funds (compounding - carried past the end of a cycle)
  let mode: "normal" | "reverse" = "normal";
  let reverseFirstDay = false;
  let recoverConfirmed = false;
  let entryLimit: number | null = null;
  const closes: number[] = [];

  const push = (side: "buy" | "sell", bar: Bar, q: number, price: number, pnl = 0) =>
    trades.push({ date: bar.date, side, price, qty: q, pnl, roundNo: Math.round(T * 100) / 100 });

  const buyFill = (q: number, price: number) => {
    const cost = price * q;
    avg = qty + q > 0 ? (avg * qty + cost) / (qty + q) : price;
    qty += q;
    cash -= cost;
    return cost;
  };

  for (const bar of bars) {
    const prev5 = closes.slice(-5);
    const ref = closes.length ? closes[closes.length - 1] : bar.close; // reference price = the previous close
    closes.push(bar.close);

    if (mode === "reverse" && recoverConfirmed) {
      mode = "normal";
      recoverConfirmed = false;
    }

    const wasEntry = qty === 0 && mode === "normal";
    if (wasEntry && entryLimit === null) {
      // First day of a new cycle: plan only (tomorrow's LOC at the previous close + 10%)
      entryLimit = bar.close * (1 + BIG_BUY_PCT);
      equityCurve.push({ date: bar.date, equity: 0 });
      continue;
    }

    const plan = v4PlanDay({
      mode, t: T, avg, holding: qty, cash, refPrice: ref,
      entryLimit, prev5, reverseFirstDay, cfg: planCfg,
    });

    const one = cash / Math.max(0.5, splits - T);
    const entryShot = cash / splits;
    let soldQ75 = false;
    let soldQ25 = false;
    let bought = 0;
    let revSold = false;
    let revBought = false;

    // Sells first (the current rule order), then buys - each order scored by the fill model
    for (const o of [...plan].sort((a, b) => (a.side === "sell" ? 0 : 1) - (b.side === "sell" ? 0 : 1))) {
      if (o.side === "sell") {
        if (o.kind === "market") {
          push("sell", bar, o.qty, bar.close, (bar.close - avg) * o.qty);
          qty -= o.qty;
          cash += bar.close * o.qty;
          revSold = true;
        } else if (o.kind === "limit" && bar.high >= o.price) {
          push("sell", bar, o.qty, o.price, (o.price - avg) * o.qty);
          qty -= o.qty;
          cash += o.price * o.qty;
          soldQ75 = true;
        } else if (o.kind === "loc" && bar.close >= o.price) {
          push("sell", bar, o.qty, bar.close, (bar.close - avg) * o.qty);
          qty -= o.qty;
          cash += bar.close * o.qty;
          if (o.tag === "q25") soldQ25 = true;
          else revSold = true;
        }
      } else if (bar.close <= o.price) { // 매수 LOC: 종가≤지정가 → 종가 체결
        bought += buyFill(o.qty, bar.close);
        push("buy", bar, o.qty, bar.close);
        if (o.tag === "rev_qbuy") revBought = true;
      }
    }

    // State transitions
    if (mode === "normal") {
      if (wasEntry) {
        if (bought > 0) {
          T = bought / entryShot;
          entryLimit = null;
        } else {
          entryLimit = bar.close * (1 + BIG_BUY_PCT); // unfilled -> refresh the reference
        }
      } else if (qty === 0) {
        avg = 0;
        T = 0;
        entryLimit = null; // cycle over (compounding)
      } else {
        if (soldQ75) T *= 0.25;
        else if (soldQ25) T *= 0.75;
        if (bought > 0) T += bought / one;
        if (T > splits - 1) {
          mode = "reverse";
          reverseFirstDay = true;
        }
      }
    } else {
      if (reverseFirstDay) {
        if (revSold) T *= REV_SELL_DECAY;
        reverseFirstDay = false;
      } else {
        if (revSold) T *= REV_SELL_DECAY;
        if (revBought) T += (splits - T) * 0.25;
      }
      if (qty === 0) {
        avg = 0;
        T = 0;
        mode = "normal";
        entryLimit = null;
      } else if (bar.close > avg * (1 - RECOVER_PCT)) {
        recoverConfirmed = true; // recovery confirmed -> normal mode from tomorrow (T carries over)
      }
    }

    equityCurve.push({ date: bar.date, equity: qty * bar.close });
  }

  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return { trades, equityCurve, totalPnl, resolvedV: V };
}

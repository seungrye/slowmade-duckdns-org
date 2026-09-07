// Trend-following backtest engine. The original backtest/engine.py is infinite-buying only (it never sets history),
// so it cannot run trend following - this fills history (closes newest first) and streams TrendFollowing.generate
// instead. Fills are market = close (trend following only places market orders).

import { generate } from "./trend-following";
import type { Bar, TrendConfig, TrendState, BacktestResult, BtTrade, EquityPoint, Signal } from "./types";

export function runTrendBacktest(bars: Bar[], cfg: TrendConfig): BacktestResult {
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let holdingQty = 0;
  let costBasis = 0;
  const closes: number[] = []; // accumulate closes chronologically

  const need = cfg.longMa + 1; // the shortest history generate needs (the long MA plus yesterday for comparison)
  for (const bar of bars) {
    closes.push(bar.close);
    const avg = holdingQty ? costBasis / holdingQty : 0;
    // Pass only the most recent `need`, newest first - sma uses just the leading period, so the result is identical (and it avoids O(n^2)).
    const recent = closes.slice(Math.max(0, closes.length - need));
    const history = recent.slice().reverse();
    const state = { price: bar.close, holdingQty, avgPrice: avg, history };

    for (const sig of generate(state, cfg)) {
      const filled = bar.close; // market -> fills at the close
      if (sig.side === "buy") {
        costBasis += filled * sig.qty;
        holdingQty += sig.qty;
        trades.push({ date: bar.date, side: "buy", price: filled, qty: sig.qty, pnl: 0, roundNo: 0 });
      } else {
        const pnl = (filled - avg) * holdingQty;
        trades.push({ date: bar.date, side: "sell", price: filled, qty: holdingQty, pnl, roundNo: 0 });
        holdingQty = 0;
        costBasis = 0;
      }
    }
    equityCurve.push({ date: bar.date, equity: holdingQty * bar.close });
  }

  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return { trades, equityCurve, totalPnl };
}

/** The shared runner for the variant strategies (v2, v3, v4) - the generate callback and the required history length are injected.
 *  On top of the v1 runner's fill model (market = close) it tracks the highest close while holding (peak) and passes it
 *  through state (for v4's trailing stop). The v1 runner (runTrendBacktest) is the version cross-checked against
 *  Python and is left alone. */
export function runTrendVariantBacktest(
  bars: Bar[],
  need: number, // generate 에 필요한 최소 history 길이
  gen: (state: TrendState) => Signal[],
): BacktestResult {
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let holdingQty = 0;
  let costBasis = 0;
  let peak = 0; // the highest close while holding (reset on a buy, 0 on liquidation)
  const closes: number[] = [];

  for (const bar of bars) {
    closes.push(bar.close);
    if (holdingQty > 0) peak = Math.max(peak, bar.close); // decide the signal after today's close is in
    const avg = holdingQty ? costBasis / holdingQty : 0;
    const recent = closes.slice(Math.max(0, closes.length - need));
    const history = recent.slice().reverse();
    const state: TrendState = { price: bar.close, holdingQty, avgPrice: avg, history, peak };

    for (const sig of gen(state)) {
      const filled = bar.close; // market -> fills at the close
      if (sig.side === "buy") {
        costBasis += filled * sig.qty;
        holdingQty += sig.qty;
        peak = filled; // start tracking the high from entry
        trades.push({ date: bar.date, side: "buy", price: filled, qty: sig.qty, pnl: 0, roundNo: 0 });
      } else {
        const pnl = (filled - avg) * holdingQty;
        trades.push({ date: bar.date, side: "sell", price: filled, qty: holdingQty, pnl, roundNo: 0 });
        holdingQty = 0;
        costBasis = 0;
        peak = 0;
      }
    }
    equityCurve.push({ date: bar.date, equity: holdingQty * bar.close });
  }

  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return { trades, equityCurve, totalPnl };
}

// Infinite-buying backtest engine - a port of run_backtest() from stock-automator-v2's backtest/engine.py.
// Daily bars are streamed a day at a time and generate()'s signals filled with a simple model.
//   - Market -> fills at the close.
//   - Buy limit/LOC -> fills when the day's low is at or below the limit.
//   - Sell limit -> fills when the day's high is at or above the limit.
//   - A sell is always a full take profit, resetting the cycle (holding, average and round to 0).
// No fees, slippage or cash constraints (the same approximation as the original).

import { generate } from "./infinite-buying";
import type { Bar, InfiniteConfig, Signal, BacktestResult, BtTrade, EquityPoint } from "./types";

function fill(sig: Signal, bar: Bar): number | null {
  if (sig.ordType === "market") return bar.close;
  if (sig.side === "buy") return bar.low <= sig.price ? sig.price : null;
  return bar.high >= sig.price ? sig.price : null;
}

export function runBacktest(bars: Bar[], cfg: InfiniteConfig): BacktestResult {
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let holdingQty = 0;
  let costBasis = 0;
  let roundNo = 0;

  for (const bar of bars) {
    const avg = holdingQty ? costBasis / holdingQty : 0;
    const state = { price: bar.close, holdingQty, avgPrice: avg, roundNo };

    for (const sig of generate(state, cfg)) {
      const filled = fill(sig, bar);
      if (filled === null) continue;
      if (sig.side === "buy") {
        costBasis += filled * sig.qty;
        holdingQty += sig.qty;
        roundNo += 1;
        trades.push({ date: bar.date, side: "buy", price: filled, qty: sig.qty, pnl: 0, roundNo });
      } else {
        // sell = full take profit
        const pnl = (filled - avg) * holdingQty;
        trades.push({ date: bar.date, side: "sell", price: filled, qty: holdingQty, pnl, roundNo });
        holdingQty = 0;
        costBasis = 0;
        roundNo = 0;
      }
    }
    equityCurve.push({ date: bar.date, equity: holdingQty * bar.close });
  }

  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return { trades, equityCurve, totalPnl };
}

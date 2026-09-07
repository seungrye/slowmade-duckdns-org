// Trend following (moving-average golden/dead cross) - a port of generate() from
// stock-automator-v2's strategy/trend_following.py. A pure function. The original rules:
//   - Enter with a market order for the principal on the golden-cross day (short MA <= long yesterday, short > long today).
//   - Liquidate the whole holding at market on a dead cross (short MA <= long today). No fixed stop loss.
//   - No rounds, splits or LOCs - it buys and sells once, when the trend turns.

import { trendDecide } from "@/lib/trading/strategies";
import type { Signal, TrendConfig, TrendState } from "./types";

/** The average of the leading `period` entries of a newest-first close array. null when shorter than period. */
export function sma(closesNewestFirst: number[], period: number): number | null {
  if (closesNewestFirst.length < period) return null;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closesNewestFirst[i];
  return sum / period;
}

// The backtest calls **the same decision function** live uses (trendDecide, the very one) -
// one code path for backtest and live. This file only maps it to the market-order fill model (as Signals).
export function generate(state: TrendState, cfg: TrendConfig): Signal[] {
  return trendDecide({
    symbol: "", closes: state.history, price: state.price, holdingQty: state.holdingQty,
    principal: cfg.principal, shortMa: cfg.shortMa, longMa: cfg.longMa,
  }).map((it) => ({ side: it.side, qty: it.qty, price: it.price,
                    ordType: "market" as const, reason: it.reason }));
}

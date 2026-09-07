// Regime momentum v1 - a long moving-average regime filter plus absolute momentum (one symbol, long only, cash as the refuge).
//
// Literature:
//   - Meb Faber, "A Quantitative Approach to Tactical Asset Allocation" (2007) - timing that holds only above a long
//     SMA (10 months, about 200 days) keeps the return while more than halving the MDD.
//   - Gary Antonacci, "Dual Momentum" - absolute momentum (holding only when the past return is positive) defends in down markets.
// The combined rules:
//   Enter (from cash): close > SMA(smaPeriod) x (1 + bandPct)  AND  close >= the close momDays ago
//   Exit (while holding): close < SMA(smaPeriod) x (1 - bandPct)  OR  close <= the high while held x (1 - trailPct)
//   - The band (hysteresis) reduces churn (whipsaw) around the SMA.
//   - Entry is state-based, so it re-enters automatically after a trailing stop if the regime and momentum still hold.
//   - Applied to a leveraged ETF (TQQQ and the like) it gives 3x exposure only in an up regime and cash in a down one - the point of the strategy.

import { sma } from "./trend-following";
import type { RegimeV1Config, Signal, TrendState } from "./types";

export function generateRegimeV1(state: TrendState, cfg: RegimeV1Config): Signal[] {
  const cl = state.history; // newest first (today = cl[0])
  const need = Math.max(cfg.smaPeriod, cfg.momDays + 1);
  if (cl.length < need) return [];

  const ma = sma(cl, cfg.smaPeriod);
  if (ma === null) return [];
  const momBase = cl[cfg.momDays]; // the close momDays ago

  if (state.holdingQty === 0) {
    const regimeUp = state.price > ma * (1 + cfg.bandPct);
    const momentumUp = state.price >= momBase;
    if (regimeUp && momentumUp) {
      const qty = Math.floor(cfg.principal / state.price);
      if (qty >= 1) {
        return [{ side: "buy", qty, price: state.price, ordType: "market",
                  reason: `레짐 진입(>${cfg.smaPeriod}SMA+${(cfg.bandPct * 100).toFixed(0)}% & ${cfg.momDays}일 모멘텀)` }];
      }
    }
  } else {
    const peak = state.peak ?? 0;
    if (peak > 0 && state.price <= peak * (1 - cfg.trailPct)) {
      return [{ side: "sell", qty: state.holdingQty, price: state.price, ordType: "market",
                reason: `트레일링 스탑 청산(고점 ${peak.toFixed(2)} 대비 -${(cfg.trailPct * 100).toFixed(0)}%)` }];
    }
    if (state.price < ma * (1 - cfg.bandPct)) {
      return [{ side: "sell", qty: state.holdingQty, price: state.price, ordType: "market",
                reason: `레짐 이탈 청산(<${cfg.smaPeriod}SMA-${(cfg.bandPct * 100).toFixed(0)}%)` }];
    }
  }
  return [];
}

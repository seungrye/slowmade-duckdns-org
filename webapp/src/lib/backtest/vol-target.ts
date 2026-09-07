// Volatility-targeted leverage - exposure to a leveraged ETF is adjusted with a partial position to hit a target volatility.
// Exposure f = min(maxLeverage, targetVol / realised volatility). When volatility spikes, exposure falls (more cash) and the drawdown softens.
// With a signal (a 1x index) given, breaking the SMA regime sets f = 0 (cash). Unlike rotation it uses partial positions and rebalances daily.

import { smaNewest } from "@/lib/trading/strategies";
import type { BacktestResult, BtTrade, EquityPoint, VolTargetV1Config } from "./types";
import type { RotationCandidate } from "./rotation";

/** Realised annual volatility - the population standard deviation of daily returns x sqrt(252). null with fewer than 2 returns. */
export function realizedVol(dailyReturns: number[], tradingDays = 252): number | null {
  if (dailyReturns.length < 2) return null;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / dailyReturns.length;
  return Math.sqrt(variance) * Math.sqrt(tradingDays);
}

/** Target exposure = min(maxLev, targetVol / realised volatility). Realised volatility of 0 or less gives maxLev. Never negative. */
export function targetExposure(realizedVolAnn: number, targetVolAnn: number, maxLev: number): number {
  if (realizedVolAnn <= 0) return maxLev;
  return Math.max(0, Math.min(maxLev, targetVolAnn / realizedVolAnn));
}

/** The volatility-targeting backtest. target is the leveraged ETF, signal an optional regime signal (a 1x index). */
export function runVolTargetBacktest(
  target: RotationCandidate,
  cfg: VolTargetV1Config,
  signalBars?: { date: string; close: number }[],
): BacktestResult {
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const fee = cfg.feeRate && cfg.feeRate > 0 ? cfg.feeRate : 0;
  const targetVol = cfg.targetVolPct / 100;
  const band = cfg.bandPct ?? 0.01;
  const sigMap = signalBars ? new Map(signalBars.map((b) => [b.date, b.close])) : null;

  let cash = cfg.principal;
  let qty = 0;
  const rets: number[] = []; // the target's daily returns
  let prevClose: number | null = null;
  const sigCloses: number[] = [];
  let regimeOn = true; // updated only when there is a signal (hysteresis)
  // Accumulating (a monthly deposit) - in a deposit month the drift band is ignored and it rebalances anyway, investing only the f share ((1 - f) stays as a buffer).
  const contribution = cfg.contribution && cfg.contribution > 0 ? cfg.contribution : 0;
  const contributions: { date: string; amount: number }[] = [];
  let prevMonth: string | null = null;

  for (const bar of target.bars) {
    const date = bar.date;
    const price = bar.close;
    if (prevClose !== null && prevClose > 0) rets.push(price / prevClose - 1);
    prevClose = price;
    if (sigMap) { const sc = sigMap.get(date); if (sc !== undefined) sigCloses.push(sc); }

    const inRange = (!cfg.from || date >= cfg.from) && (!cfg.to || date <= cfg.to);
    if (!inRange) continue;

    let contributedThisBar = false;
    if (contribution > 0) {
      const ym = date.slice(0, 7);
      if (prevMonth !== null && ym !== prevMonth) { cash += contribution; contributions.push({ date, amount: contribution }); contributedThisBar = true; }
      prevMonth = ym;
    }

    // Regime (optional): the signal SMA's hysteresis
    if (sigMap && cfg.smaPeriod) {
      const ma = smaNewest([...sigCloses].reverse(), cfg.smaPeriod);
      const sc = sigCloses[sigCloses.length - 1];
      if (ma !== null && sc !== undefined) {
        if (sc > ma * (1 + band)) regimeOn = true;
        else if (sc < ma * (1 - band)) regimeOn = false;
      }
    }
    const rv = realizedVol(rets.slice(-cfg.volLookback));
    let f = rv === null ? 0 : targetExposure(rv, targetVol, cfg.maxLeverage);
    if (sigMap && cfg.smaPeriod && !regimeOn) f = 0;

    const equity = cash + qty * price;
    const curVal = qty * price;
    const targetVal = f * equity;
    // Rebalance only when the drift exceeds the band (fewer trades). In a deposit month it rebalances anyway, so the deposit is allocated at once.
    if (equity > 0 && (contributedThisBar || Math.abs(targetVal - curVal) / equity > cfg.rebalanceBand)) {
      const targetQty = price > 0 ? Math.floor(targetVal / price) : 0;
      const delta = targetQty - qty;
      if (delta > 0) { const cost = delta * price * (1 + fee); if (cost <= cash) { cash -= cost; qty += delta; trades.push({ date, side: "buy", price, qty: delta, pnl: 0, roundNo: 0, ticker: target.ticker }); } }
      else if (delta < 0) { const sellN = -delta; cash += sellN * price * (1 - fee); qty -= sellN; trades.push({ date, side: "sell", price, qty: sellN, pnl: 0, roundNo: 0, ticker: target.ticker }); }
    }
    equityCurve.push({ date, equity: cash + qty * price });
  }
  const invested = contribution > 0 ? cfg.principal + contributions.reduce((s, c) => s + c.amount, 0) : cfg.principal;
  const totalPnl = equityCurve.length ? equityCurve[equityCurve.length - 1].equity - invested : 0;
  return {
    trades, equityCurve, totalPnl,
    ...(contribution > 0 ? { contributions, totalContributed: invested } : {}),
  };
}

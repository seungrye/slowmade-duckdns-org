// Backtest performance metrics - computed purely from equityCurve (the total-assets time series).
// Neither the site nor Python had CAGR/Sharpe/Calmar, so this is new (the client currently inlines only MDD and cumulative return).
// A helper for comparing return, defence and risk-adjustment at once across strategies (rotation lump sum versus accumulating, say).

import type { EquityPoint } from "./types";

export interface BacktestMetrics {
  final: number; // final assets
  totalReturnPct: number; // cumulative return % (TWR when accumulating, otherwise final / principal - 1)
  cagr: number; // compound annual growth rate % (252 trading days; TWR-based when accumulating)
  mdd: number; // maximum drawdown % (negative, the trough against the peak; against the TWR index when accumulating)
  calmar: number; // cagr / |mdd| (return against defence)
  sharpe: number; // annualised Sharpe from daily returns (risk-free 0)
  /**
   * Annualised volatility % - the standard deviation of daily returns x sqrt(252).
   *
   * Return alone cannot say "how much shaking bought that". At the same CAGR, twice the volatility is far harder to
   * actually hold. Sharpe crushes the two into one number, so risk is shown on its own. Always 0 or more.
   */
  volatility: number;
  totalContributed?: number; // accumulating: initial principal + total deposits (shown for reference, separate from the return's denominator)
}

const TRADING_DAYS = 252;

/** equityCurve plus the principal -> performance metrics. An empty curve gives zeroes. A pure function (testable).
 *
 *  Given contributions (the accumulating deposit schedule), total return, CAGR, MDD and Sharpe are computed as a
 *  **time-weighted return (TWR)** with the inflowing capital removed (so assets grown by a deposit are not mistaken
 *  for return). The index starts at 1 and compounds the daily net returns (1 + r_i); on a deposit day the return is
 *  equity_i / (equity_{i-1} + flow_i) - 1. With contributions absent or empty it matches the original (lump-sum) calculation. */
export function computeMetrics(
  equityCurve: EquityPoint[],
  principal: number,
  contributions?: { date: string; amount: number }[],
): BacktestMetrics {
  const n = equityCurve.length;
  const hasContrib = !!contributions && contributions.length > 0;
  // An empty curve, or a lump-sum principal <= 0 with no contributions (no capital), gives zeroes. Pure accumulation
  // (principal 0) can still be computed from the TWR index (which starts at 1 and needs no principal), so it must not be filtered out here.
  if (n === 0 || (principal <= 0 && !hasContrib)) {
    return { final: n ? equityCurve[n - 1].equity : principal, totalReturnPct: 0, cagr: 0, mdd: 0, calmar: 0, sharpe: 0, volatility: 0 };
  }
  const final = equityCurve[n - 1].equity;
  const flowByDate = new Map<string, number>();
  if (hasContrib) for (const c of contributions!) flowByDate.set(c.date, (flowByDate.get(c.date) ?? 0) + c.amount);
  const totalContributed = hasContrib
    ? principal + contributions!.reduce((s, c) => s + c.amount, 0)
    : undefined;

  // Daily net returns - on a deposit day the inflow is added to the base and excluded from the return (TWR).
  const rets: number[] = [];
  for (let i = 1; i < n; i++) {
    const flow = hasContrib ? (flowByDate.get(equityCurve[i].date) ?? 0) : 0;
    const base = equityCurve[i - 1].equity + flow;
    if (base > 0) rets.push(equityCurve[i].equity / base - 1);
  }

  // The valuation index - equity itself for a lump sum, or a TWR curve starting at 1 when accumulating.
  const idx: number[] = new Array(n);
  if (!hasContrib) {
    for (let i = 0; i < n; i++) idx[i] = equityCurve[i].equity;
  } else {
    idx[0] = 1;
    for (let i = 1; i < n; i++) {
      const flow = flowByDate.get(equityCurve[i].date) ?? 0;
      const base = equityCurve[i - 1].equity + flow;
      idx[i] = idx[i - 1] * (base > 0 ? equityCurve[i].equity / base : 1);
    }
  }
  const idxStart = hasContrib ? 1 : principal;
  const idxEnd = idx[n - 1];

  const totalReturnPct = (idxEnd / idxStart - 1) * 100;

  // MDD - the deepest drawdown (%) from the index curve's peak
  let peak = -Infinity;
  let mddFrac = 0;
  for (const v of idx) {
    if (v > peak) peak = v;
    if (peak > 0) mddFrac = Math.min(mddFrac, v / peak - 1);
  }
  const mdd = mddFrac * 100;

  // CAGR - trading days converted to years (against the index)
  const years = n / TRADING_DAYS;
  const cagr = years > 0 && idxEnd > 0 ? (Math.pow(idxEnd / idxStart, 1 / years) - 1) * 100 : 0;

  // Sharpe and volatility - both come from the standard deviation of daily returns, so it is measured once.
  // With only one day of samples (rets.length <= 1) no standard deviation exists, so it is left at 0.
  let sharpe = 0;
  let volatility = 0;
  if (rets.length > 1) {
    const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
    const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
    const sd = Math.sqrt(variance);
    sharpe = sd > 0 ? (mean / sd) * Math.sqrt(TRADING_DAYS) : 0;
    volatility = sd * Math.sqrt(TRADING_DAYS) * 100;
  }

  const calmar = mdd < 0 ? cagr / Math.abs(mdd) : 0;
  return { final, totalReturnPct, cagr, mdd, calmar, sharpe, volatility, ...(totalContributed !== undefined ? { totalContributed } : {}) };
}

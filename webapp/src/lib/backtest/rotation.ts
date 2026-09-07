// Momentum rotation v1 - dual momentum (Gary Antonacci) crossed with a regime filter (LRS/Gayed).
//
//   - Relative momentum: compare the candidate ETFs' returns over the last momDays and hold only the leader, in full.
//     The leader is re-evaluated every rebalanceDays (63 trading days by default, about a quarter - monthly loses to
//     whipsaw) and switched when it changes (at the same day's close).
//   - Absolute / regime: when the signal (a 1x index such as QQQ) closes below SMA x (1 - band), go fully to cash,
//     checked daily - defence does not wait for the rebalance cycle. On recovery above SMA x (1 + band), re-enter that day's leader.
//   - Compounding: the whole sale proceeds are reinvested on the next entry.
//   - Fill model: switches, entries and exits all fill at that day's close (approximating a market order). No fees or slippage.
//
// Symbol selection is built into the rules, so nobody has to choose "which leveraged ETF to buy" - set the candidate
// pool and it rotates into whichever is strong. Indicators (SMA and momentum) warm up on data before from, and
// trading happens only within from~to.

import { rotationDecide } from "@/lib/trading/strategies";
import { DEFAULT_LIQ_DAYS, DEFAULT_POOL_SIZE, liquidityMetric, selectPool } from "./rotation-pool";
import type { BacktestResult, Bar, BtTrade, EquityPoint, RotationV1Config } from "./types";

// The backtest calls **the same decision function** live uses (rotationDecide, the very one).
// It only handles pool auto-selection, the fill model (the close) and the equity curve - one code path for backtest and live.

export interface RotationCandidate {
  ticker: string;
  bars: Bar[]; // the whole history including warm-up, in ascending date order. Auto-selection mode wants volume included.
}

export function runRotationBacktest(
  candidates: RotationCandidate[],
  signalBars: Bar[],
  cfg: RotationV1Config,
): BacktestResult {
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const closeMaps = candidates.map((c) => new Map(c.bars.map((b) => [b.date, b.close])));
  const series: number[][] = candidates.map(() => []); // accumulate each candidate's closes chronologically (for momentum)
  // Candidate auto-selection (autoSeed): accumulate traded value (close x volume) plus the current pool (the same as Python's run_rotation_backtest)
  const autoSeed = cfg.autoSeed;
  const volMaps = autoSeed
    ? candidates.map((c) => new Map(c.bars.map((b) => [b.date, b.volume ?? 0])))
    : [];
  const valSeries: number[][] = candidates.map(() => []);
  const poolLog: string[] = [];
  let pool: Set<string> | null = null;

  let cash = cfg.principal;
  let heldIdx = -1; // index of the candidate held (-1 = cash)
  let qty = 0;
  let avg = 0;
  let sinceRebalance = 0;
  const sigCloses: number[] = [];
  // DCA state - used only when dcaSlices > 1. After an entry or switch, the remaining slices are spent daily.
  const dcaSlices = cfg.dcaSlices && cfg.dcaSlices > 1 ? Math.floor(cfg.dcaSlices) : 0;
  let dcaTarget = -1; // index of the candidate being averaged into
  let dcaLeft = 0; // slices left
  let sliceCash = 0; // cash per slice (cash / dcaSlices, fixed at entry)
  // Accumulating (a monthly deposit) - cash arrives at each month boundary and, while holding with the regime on, buys more at that day's close.
  const contribution = cfg.contribution && cfg.contribution > 0 ? cfg.contribution : 0;
  const contributions: { date: string; amount: number }[] = [];
  let prevMonth: string | null = null;

  const smaLast = (): number | null => {
    if (sigCloses.length < cfg.smaPeriod) return null;
    let s = 0;
    for (let i = sigCloses.length - cfg.smaPeriod; i < sigCloses.length; i++) s += sigCloses[i];
    return s / cfg.smaPeriod;
  };

  const fee = cfg.feeRate && cfg.feeRate > 0 ? cfg.feeRate : 0; // one-way transaction cost (fees plus slippage)

  const sell = (date: string, price: number) => {
    trades.push({ date, side: "sell", price, qty, pnl: (price - avg) * qty, roundNo: 0,
                  ticker: candidates[heldIdx].ticker });
    cash += price * qty * (1 - fee);
    heldIdx = -1;
    qty = 0;
    avg = 0;
  };

  const buy = (date: string, i: number, price: number) => {
    const q = Math.floor(cash / (price * (1 + fee)));
    if (q < 1) return;
    trades.push({ date, side: "buy", price, qty: q, pnl: 0, roundNo: 0, ticker: candidates[i].ticker });
    cash -= price * q * (1 + fee);
    heldIdx = i;
    qty = q;
    avg = price;
  };

  // The cumulative buy for DCA - buys within budget (the slice's cash) and updates the average price cumulatively.
  const addBuy = (date: string, i: number, price: number, budget: number): boolean => {
    const q = Math.floor(budget / (price * (1 + fee)));
    if (q < 1) return false;
    trades.push({ date, side: "buy", price, qty: q, pnl: 0, roundNo: 0, ticker: candidates[i].ticker });
    avg = qty > 0 ? (avg * qty + price * q) / (qty + q) : price;
    cash -= price * q * (1 + fee);
    qty += q;
    heldIdx = i;
    return true;
  };

  for (const bar of signalBars) {
    // Accumulate indicators always - warming up even outside the trading window
    sigCloses.push(bar.close);
    for (let i = 0; i < candidates.length; i++) {
      const c = closeMaps[i].get(bar.date);
      if (c !== undefined) {
        series[i].push(c);
        if (autoSeed) valSeries[i].push(c * (volMaps[i].get(bar.date) ?? 0));
      }
    }
    const inRange = (!cfg.from || bar.date >= cfg.from) && (!cfg.to || bar.date <= cfg.to);
    // Accumulating: deposit whenever the month changes inside the trading window (the first in-range month is the initial principal and excluded).
    if (inRange && contribution > 0) {
      const ym = bar.date.slice(0, 7);
      if (prevMonth !== null && ym !== prevMonth) {
        cash += contribution;
        contributions.push({ date: bar.date, amount: contribution });
      }
      prevMonth = ym;
    }
    // Auto-selection: re-select the pool at the same points as live (pool unset, holding cash, re-evaluation due) - before deciding.
    if (inRange && autoSeed
        && (pool === null || heldIdx < 0 || sinceRebalance >= cfg.rebalanceDays)) {
      const metrics: Record<string, number | null> = {};
      for (let i = 0; i < candidates.length; i++) {
        metrics[candidates[i].ticker] = liquidityMetric(valSeries[i], cfg.liqDays ?? DEFAULT_LIQ_DAYS);
      }
      const newPool = selectPool(autoSeed, metrics, cfg.poolSize ?? DEFAULT_POOL_SIZE);
      // Only membership changes count - a liquidity reshuffle does not affect trading (the same rule as Python's backtest and engine).
      if (pool === null || newPool.length !== pool.size || !newPool.every((t) => pool!.has(t))) {
        poolLog.push(`${bar.date} 후보 ${pool === null ? "선발" : "갱신"}: ${newPool.join(",")}`);
        pool = new Set(newPool);
      }
    }
    const ma = smaLast();
    if (inRange && ma !== null) {
      const heldClose = heldIdx >= 0 ? closeMaps[heldIdx].get(bar.date) : undefined;
      // The re-evaluation counter advances only on days that are "holding and regime on" (the same timing as the original) - incremented before decide.
      const regimeOn = bar.close > ma * (1 + cfg.bandPct);
      if (regimeOn && heldIdx >= 0) sinceRebalance++;

      // Only pool candidates with data today become candidates, and each one's closes are passed newest first.
      const poolCands: string[] = [];
      const candCloses: Record<string, number[]> = {};
      for (let i = 0; i < candidates.length; i++) {
        if (pool && !pool.has(candidates[i].ticker)) continue;
        if (!closeMaps[i].has(bar.date)) continue;
        poolCands.push(candidates[i].ticker);
        // Pass the largest lookback's worth of recent closes for composite momentum, or momDays' worth otherwise.
        const need = cfg.momLookbacks && cfg.momLookbacks.length ? Math.max(...cfg.momLookbacks) : cfg.momDays;
        candCloses[candidates[i].ticker] = series[i].slice(-(need + 1)).reverse();
      }
      const dec = rotationDecide({
        candidates: poolCands, signalCloses: sigCloses.slice(-cfg.smaPeriod).reverse(),
        candCloses, holding: heldIdx >= 0 ? candidates[heldIdx].ticker : null,
        daysSinceRebalance: sinceRebalance, momLookbacks: cfg.momLookbacks,
        smaPeriod: cfg.smaPeriod, bandPct: cfg.bandPct, momDays: cfg.momDays, rebalanceDays: cfg.rebalanceDays,
      });

      if (dec.action === "cash") {
        if (heldIdx >= 0 && heldClose !== undefined) sell(bar.date, heldClose); // liquidate on a regime-off
        dcaLeft = 0; // cancel any remaining DCA plan on liquidation
      } else if (dec.action === "switch" && dec.target) {
        const ti = candidates.findIndex((c) => c.ticker === dec.target);
        const tp = ti >= 0 ? closeMaps[ti].get(bar.date) : undefined;
        if (tp !== undefined && (heldIdx < 0 || heldClose !== undefined)) {
          if (heldIdx >= 0 && heldClose !== undefined) sell(bar.date, heldClose); // switch at the same day's close
          if (dcaSlices) {
            // Schedule the DCA - split the cash available after selling into dcaSlices and buy only the first slice today.
            dcaTarget = ti;
            sliceCash = cash / dcaSlices;
            dcaLeft = dcaSlices;
            if (addBuy(bar.date, ti, tp, sliceCash)) dcaLeft--;
          } else {
            buy(bar.date, ti, tp); // lump sum (as before)
          }
          sinceRebalance = 0;
        }
      } else {
        // hold (including holding through a re-evaluation) - if a DCA is running, spend today's slice.
        if (dcaLeft > 0 && heldIdx === dcaTarget && regimeOn && heldClose !== undefined) {
          if (addBuy(bar.date, dcaTarget, heldClose, sliceCash)) dcaLeft--;
        } else if (contribution > 0 && heldIdx >= 0 && regimeOn && heldClose !== undefined) {
          // Put contributions and idle cash to work at once (removing cash drag) - only while holding with the regime on. With 0 cash it is a no-op.
          addBuy(bar.date, heldIdx, heldClose, cash);
        }
        if (dec.rebalanced) sinceRebalance = 0; // "the leader is unchanged" on a re-evaluation day (no switch) also resets the counter
      }
    }
    if (inRange) {
      const heldClose = heldIdx >= 0 ? closeMaps[heldIdx].get(bar.date) : undefined;
      // total assets (cash + holdings) - rotation spends long stretches with the regime off, so the total-assets curve is the more useful one
      equityCurve.push({ date: bar.date, equity: cash + (heldClose !== undefined ? qty * heldClose : qty * avg) });
    }
  }

  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return {
    trades, equityCurve, totalPnl,
    ...(autoSeed ? { poolLog } : {}),
    ...(contribution > 0
      ? { contributions, totalContributed: cfg.principal + contributions.reduce((s, c) => s + c.amount, 0) }
      : {}),
  };
}

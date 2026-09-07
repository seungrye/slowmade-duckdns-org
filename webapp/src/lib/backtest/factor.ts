// Cross-sectional factor backtest (pure) - ranks a multi-symbol universe by a factor and buys the top or bottom
// quantile equally weighted, rebalanced monthly. Three factors (low volatility, cross-sectional momentum, short-term
// mean reversion) plus benchmarks (equal weight, a market ETF). Closes only. Long-only, equally weighted, no transaction costs (v1). Metrics reuse metrics.computeMetrics.
//
// Survivorship bias: if the input universe is *today's* constituents, excluding delisted symbols biases the result optimistically.

import type { EquityPoint } from "./types";
import { computeMetrics, type BacktestMetrics } from "./metrics";

export interface FactorMatrix {
  dates: string[]; // sorted trading days (the alignment axis), "YYYY-MM-DD"
  closes: Map<string, (number | null)[]>; // ticker -> closes aligned to dates (null where missing)
}

export interface FactorParams {
  quantile: number; // top/bottom quantile share (0.2 = 20%)
  volLookback: number; // low-volatility lookback (trading days)
  momLong: number; // momentum lookback (trading days, about 12 months)
  momSkip: number; // momentum's recent exclusion (trading days, about 1 month)
  revLookback: number; // mean-reversion lookback (trading days, about 1 month)
  minNames: number; // minimum symbols to pick a quantile
}

export const DEFAULT_FACTOR_PARAMS: FactorParams = {
  quantile: 0.2,
  volLookback: 252,
  momLong: 252,
  momSkip: 21,
  revLookback: 21,
  minNames: 5,
};

export type FactorKind = "low_vol" | "momentum" | "reversal";

// --- Internal helpers ---

/** Forward-fills missing closes from the previous value (null stays before a symbol's listing). first is each symbol's first valid index. */
function forwardFilled(
  closes: Map<string, (number | null)[]>,
  n: number,
): { ff: Map<string, (number | null)[]>; first: Map<string, number> } {
  const ff = new Map<string, (number | null)[]>();
  const first = new Map<string, number>();
  for (const [t, arr] of closes) {
    const out: (number | null)[] = new Array(n).fill(null);
    let last: number | null = null;
    let f = -1;
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      if (v != null && Number.isFinite(v) && v > 0) {
        last = v;
        if (f < 0) f = i;
      }
      out[i] = last;
    }
    ff.set(t, out);
    first.set(t, f < 0 ? Infinity : f);
  }
  return { ff, first };
}

/** The first trading-day index of each month (the monthly rebalance day). */
function monthStarts(dates: string[]): number[] {
  const idx: number[] = [];
  let lm = "";
  for (let i = 0; i < dates.length; i++) {
    const m = dates[i].slice(0, 7);
    if (m !== lm) {
      idx.push(i);
      lm = m;
    }
  }
  return idx;
}

/** The factor score at rebalance point ti (eligible symbols only). */
function scoresAt(
  kind: FactorKind,
  ff: Map<string, (number | null)[]>,
  first: Map<string, number>,
  ti: number,
  p: FactorParams,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [t, arr] of ff) {
    const f = first.get(t) ?? Infinity;
    if (kind === "low_vol") {
      if (f > ti - p.volLookback) continue; // not enough history
      let sum = 0;
      let sum2 = 0;
      let cnt = 0;
      let prev = arr[ti - p.volLookback];
      for (let i = ti - p.volLookback + 1; i <= ti; i++) {
        const c = arr[i];
        if (c != null && prev != null && prev > 0) {
          const r = c / prev - 1;
          sum += r;
          sum2 += r * r;
          cnt++;
        }
        prev = c;
      }
      if (cnt < p.volLookback / 2) continue;
      const mean = sum / cnt;
      out.set(t, Math.sqrt(Math.max(sum2 / cnt - mean * mean, 0)));
    } else if (kind === "momentum") {
      if (f > ti - p.momLong) continue;
      const a = arr[ti - p.momLong];
      const b = arr[ti - p.momSkip];
      if (a == null || b == null || a <= 0) continue;
      out.set(t, b / a - 1);
    } else {
      // reversal
      if (f > ti - p.revLookback) continue;
      const a = arr[ti - p.revLookback];
      const b = arr[ti];
      if (a == null || b == null || a <= 0) continue;
      out.set(t, b / a - 1);
    }
  }
  return out;
}

/** Sorts the scores and picks a quantile. pickLowest=true takes the low end (low volatility, recent decliners), false the high end (momentum). */
function select(scores: Map<string, number>, pickLowest: boolean, q: number, minNames: number): string[] {
  const arr = [...scores.entries()].sort((x, y) => (pickLowest ? x[1] - y[1] : y[1] - x[1]));
  if (arr.length === 0) return [];
  const k = Math.min(arr.length, Math.max(minNames, Math.floor(arr.length * q)));
  return arr.slice(0, k).map((e) => e[0]);
}

/** Simulation options - principal, monthly contribution and the investment window (as indices). Defaults are start = 1, lump sum and the full range (compatible with before). */
export interface SimOpts {
  principal: number; // initial principal (cash). 1 by default (= normalised to start at 1).
  contribution: number; // contribution on each monthly rebalance day. 0 means lump sum.
  startIdx: number; // the investment start index (earlier days are not plotted but still feed the score lookback).
  endIdx: number; // the investment end index (inclusive).
}

/** Default options from dates.length (start = 1, lump sum, the full range). */
function defaultOpts(n: number): SimOpts {
  return { principal: 1, contribution: 0, startIdx: 0, endIdx: n - 1 };
}

/** The month-start rebalance indices in [startIdx, endIdx] after startIdx (when contributions arrive; the first placement is excluded). */
function monthlyRebalances(dates: string[], startIdx: number, endIdx: number): number[] {
  return monthStarts(dates).filter((i) => i > startIdx && i <= endIdx);
}

/**
 * Derives the daily equity (money) curve by tracking position values. The selected symbols are equally weighted,
 * rebalanced monthly, and allowed to drift in between. The principal is placed at startIdx (the initial rebalance),
 * after which a contribution arrives at each month start (accumulating). The curve covers [startIdx, endIdx] only.
 * The score (selectAt) keeps referencing data before startIdx as its lookback (the caller passes the whole ff).
 */
function simulate(dates: string[], ff: Map<string, (number | null)[]>, selectAt: (ti: number) => string[], opts: SimOpts): EquityPoint[] {
  const { principal, contribution, startIdx, endIdx } = opts;
  const contribAt = new Set(monthlyRebalances(dates, startIdx, endIdx)); // contribution days
  const rebalAt = new Set<number>([startIdx, ...contribAt]); // the initial placement plus month starts
  let equity = principal;
  let positions: { t: string; shares: number }[] = [];
  const curve: EquityPoint[] = [];
  for (let ti = startIdx; ti <= endIdx; ti++) {
    if (positions.length) {
      let val = 0;
      for (const p of positions) {
        const px = ff.get(p.t)![ti];
        if (px != null) val += p.shares * px;
      }
      if (val > 0) equity = val;
    }
    if (contribution > 0 && contribAt.has(ti)) equity += contribution; // the monthly contribution (before reallocating)
    if (rebalAt.has(ti)) {
      const sel = selectAt(ti);
      if (sel.length) {
        const per = equity / sel.length;
        positions = [];
        for (const t of sel) {
          const px = ff.get(t)![ti];
          if (px != null && px > 0) positions.push({ t, shares: per / px });
        }
      }
    }
    curve.push({ date: dates[ti], equity });
  }
  return curve;
}

// --- Public API ---

/** One factor strategy's equity curve. Without opts it is start = 1, lump sum and the full range (compatible with before). */
export function runFactor(matrix: FactorMatrix, kind: FactorKind, params: FactorParams = DEFAULT_FACTOR_PARAMS, opts?: Partial<SimOpts>): EquityPoint[] {
  const o = { ...defaultOpts(matrix.dates.length), ...opts };
  const { ff, first } = forwardFilled(matrix.closes, matrix.dates.length);
  const pickLowest = kind !== "momentum";
  const selectAt = (ti: number) => select(scoresAt(kind, ff, first, ti, params), pickLowest, params.quantile, params.minNames);
  return simulate(matrix.dates, ff, selectAt, o);
}

/** The symbols selected at rebalance point ti (for tests and debugging). */
export function selectNames(matrix: FactorMatrix, kind: FactorKind, ti: number, params: FactorParams = DEFAULT_FACTOR_PARAMS): string[] {
  const { ff, first } = forwardFilled(matrix.closes, matrix.dates.length);
  return select(scoresAt(kind, ff, first, ti, params), kind !== "momentum", params.quantile, params.minNames);
}

/** Benchmark: every listed symbol equally weighted (rebalanced monthly). Without opts, start = 1, lump sum and the full range. */
export function runEqualWeight(matrix: FactorMatrix, opts?: Partial<SimOpts>): EquityPoint[] {
  const o = { ...defaultOpts(matrix.dates.length), ...opts };
  const { ff, first } = forwardFilled(matrix.closes, matrix.dates.length);
  const selectAt = (ti: number) => [...first.entries()].filter(([, f]) => f <= ti).map(([t]) => t);
  return simulate(matrix.dates, ff, selectAt, o);
}

/** Benchmark: buy and hold a single symbol (a market ETF), buying monthly when accumulating. Without opts, start = 1 and lump sum. */
export function runBuyHold(matrix: FactorMatrix, ticker: string, opts?: Partial<SimOpts>): EquityPoint[] {
  const o = { ...defaultOpts(matrix.dates.length), ...opts };
  const { ff, first } = forwardFilled(matrix.closes, matrix.dates.length);
  const f = first.get(ticker) ?? Infinity;
  const selectAt = (ti: number) => (f <= ti ? [ticker] : []);
  return simulate(matrix.dates, ff, selectAt, o);
}

/** Trims to [from, to] and rebases to start at 1 (dropping the lookback buffer so comparisons line up). */
export function trimAndRebase(curve: EquityPoint[], from: string, to: string): EquityPoint[] {
  const win = curve.filter((p) => p.date >= from && p.date <= to);
  if (!win.length) return [];
  const base = win[0].equity || 1;
  return win.map((p) => ({ date: p.date, equity: p.equity / base }));
}

export interface FactorComparisonRow {
  key: string; // low_vol | momentum | reversal | equal_weight | market
  name: string; // display name
  metrics: BacktestMetrics;
  equityCurve: EquityPoint[]; // rebase to [from, to]
}

/**
 * Runs and compares the three factors plus the benchmarks (equal weight, a market ETF) over the same period with
 * the same principal and contributions. matrix holds [the lookback buffer before from ~ to], and the curves cover
 * the [from, to] window only (the score uses the buffer as its lookback).
 * Given principal (1 by default) and contribution (0 by default, monthly), it produces real-money accumulating
 * curves plus TWR metrics.
 */
export function runFactorComparison(
  matrix: FactorMatrix,
  opts: { from: string; to: string; marketTicker?: string; params?: FactorParams; principal?: number; contribution?: number },
): FactorComparisonRow[] {
  const params = opts.params ?? DEFAULT_FACTOR_PARAMS;
  const principal = opts.principal ?? 1;
  const contribution = opts.contribution && opts.contribution > 0 ? opts.contribution : 0;
  const dates = matrix.dates;

  // The investment window: the first index at or after from, to the last index at or before to.
  let startIdx = dates.findIndex((d) => d >= opts.from);
  if (startIdx < 0) startIdx = 0;
  let endIdx = dates.length - 1;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] <= opts.to) { endIdx = i; break; }
  }
  if (endIdx < startIdx) endIdx = startIdx;
  const sim: SimOpts = { principal, contribution, startIdx, endIdx };

  // The contribution schedule (shared by every strategy = month starts in the window, the first placement excluded), used for the TWR metrics.
  const contribList = contribution > 0 ? monthlyRebalances(dates, startIdx, endIdx).map((i) => ({ date: dates[i], amount: contribution })) : undefined;

  const rows: FactorComparisonRow[] = [];
  const add = (key: string, name: string, curve: EquityPoint[]) => {
    rows.push({ key, name, equityCurve: curve, metrics: computeMetrics(curve, principal, contribList) });
  };
  add("low_vol", "저변동성", runFactor(matrix, "low_vol", params, sim));
  add("momentum", "모멘텀(12-1)", runFactor(matrix, "momentum", params, sim));
  add("reversal", "단기 평균회귀", runFactor(matrix, "reversal", params, sim));
  add("equal_weight", "동일가중(벤치)", runEqualWeight(matrix, sim));
  if (opts.marketTicker && matrix.closes.has(opts.marketTicker)) {
    add("market", `시장ETF(${opts.marketTicker})`, runBuyHold(matrix, opts.marketTicker, sim));
  }
  return rows;
}

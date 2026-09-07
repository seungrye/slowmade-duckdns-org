// Laoer's value rebalancing (VR) - value averaging that keeps a single leveraged ETF within the band (+/-b) of the target path V.
// The account = stock (valuation = qty x price) + Pool (cash). Every cycle (2 weeks), V2 = V1 + Pool/G + CF and the band are recomputed.
// Each day a band breach rebalances back to the boundary (below the lower -> buy, above the upper -> sell). The average price is irrelevant (price only).
// Accumulating (CF > 0), lump sum (CF = 0) and withdrawing (CF < 0) are supported. The skill formula (which bends V down) was undocumented, so only the hook was reserved.

import type { BacktestResult, BtTrade, EquityPoint, ValueRebalancingConfig } from "./types";
import type { RotationCandidate } from "./rotation";
import { ladderLot, vrBuyLadder, vrSellLadder } from "./vr-ladder";

/** The basic V update: V2 = V1 + Pool/G + CF. (Pool is its value before CF - the source's example is 9000 + 1000/10 + 250 = 9350)
 *  It ignores the market - in a long decline V rises mechanically and burns through the Pool (the hold-on mode). */
export function updateVBasic(v1: number, pool: number, gradient: number, cf: number): number {
  return v1 + (gradient > 0 ? pool / gradient : 0) + cf;
}

/**
 * The skill V update (#358): V2 = V1 + Pool/G + (E - V1)/(2 sqrt(G)) + CF.
 *
 * The correction term **pulls the target path V toward the actual valuation E.** In a decline (E < V1) it raises V
 * less, so it buys less and preserves the Pool; in a rise (E > V1) it raises V more, so it sells less. `2 sqrt(G)`
 * sets the strength - at G = 10 it absorbs about 16% of the gap each cycle.
 *
 * It reproduces, to the decimal, the three relay tables from cycles 6 and 4 of the 2025 VR lecture write-up
 * (vr-skill-formula.test.ts). Until now this formula was unknown and only the basic one existed.
 */
export function updateVSkill(
  v1: number, pool: number, gradient: number, cf: number, e: number,
): number {
  const g = gradient > 0 ? gradient : 1;
  return v1 + pool / g + (e - v1) / (2 * Math.sqrt(g)) + cf;
}

/** Which formula to use - the skill formula when unset (#358). */
export function formulaOf(cfg: ValueRebalancingConfig): "basic" | "skill" {
  return cfg.formula === "basic" ? "basic" : "skill";
}

/** The operating mode - decided by CF's sign (source 7.1). */
export type VRForm = "적립식" | "거치식" | "인출식";

export function vrFormOf(cashflow?: number): VRForm {
  const cf = cashflow ?? 0;
  return cf > 0 ? "적립식" : cf < 0 ? "인출식" : "거치식";
}

/**
 * Per-mode defaults (the table in source 7.1).
 *
 * | mode | starting G | Pool limit |
 * |---|---|---|
 * | accumulating | 10 | 75% |
 * | lump sum | 10 | 50% |
 * | withdrawing | 20 | 25% |
 *
 * The source says "this is only a guide; choose more aggressively or more defensively", so a value in the settings
 * wins. **The problem was not following the mode when nothing was set** - an accumulating setup ran on the lump-sum limit (50%).
 */
export function defaultsForForm(cashflow?: number): { gradient: number; poolLimitPct: number } {
  switch (vrFormOf(cashflow)) {
    case "적립식": return { gradient: 10, poolLimitPct: 0.75 };
    case "인출식": return { gradient: 20, poolLimitPct: 0.25 };
    default: return { gradient: 10, poolLimitPct: 0.5 };
  }
}

/** The effective parameters, settings merged over the mode defaults. What is written wins. */
export function resolveVR(cfg: ValueRebalancingConfig): { gradient: number; poolLimitPct: number } {
  const d = defaultsForForm(cfg.cashflow);
  return {
    gradient: cfg.gradient && cfg.gradient > 0 ? cfg.gradient : d.gradient,
    poolLimitPct: cfg.poolLimitPct && cfg.poolLimitPct > 0 ? cfg.poolLimitPct : d.poolLimitPct,
  };
}

/**
 * The effective average price = (cumulative buys - cumulative sells) / quantity held (source 4.2).
 *
 * The nominal average (what the broker screen shows) does not move on a sell, but this does. Profitable sells pull
 * it down, and once it goes negative it means the sales brought in more than the buys cost (source 4.3, zero principal).
 */
export function effectiveAvgPrice(a: { cumBuy: number; cumSell: number; qty: number }): number | null {
  return a.qty > 0 ? (a.cumBuy - a.cumSell) / a.qty : null;
}

/** The band [lower, upper] = [V(1 - b), V(1 + b)]. */
export function bandOf(v: number, b: number): { low: number; high: number } {
  return { low: v * (1 - b), high: v * (1 + b) };
}

/** The quantity that brings the valuation (qty x price) back into the band (positive = buy, negative = sell, 0 = nothing).
 *  - valuation < low -> buy up to the lower boundary (whole shares). Buying is capped by buyBudget (the cycle's remaining limit) and pool.
 *  - valuation > high -> sell down to the upper boundary (uncapped - selling is always allowed).
 *  fee affects only the affordability check (price x (1 + fee)). The caller handles the actual proceeds and ledger. */
export function rebalanceShares(args: {
  qty: number; price: number; low: number; high: number; buyBudget: number; pool: number; fee: number;
}): number {
  const { qty, price, low, high, buyBudget, pool, fee } = args;
  if (price <= 0) return 0;
  const val = qty * price;
  if (val < low) {
    const wantUp = Math.floor((low - val) / price); // shares needed to reach the lower boundary
    const byBudget = Math.floor(buyBudget / (price * (1 + fee)));
    const byPool = Math.floor(pool / (price * (1 + fee)));
    return Math.max(0, Math.min(wantUp, byBudget, byPool));
  }
  if (val > high) {
    const wantDown = Math.floor((val - high) / price); // shares to sell to reach the upper boundary
    return -Math.min(wantDown, qty);
  }
  return 0;
}

/** The VR ledger state - shared by backtest and live. qty and pool are the ledger (live syncs them with the broker
 *  through reconciliation), V is the target path, buyBudget the cycle's remaining buy limit, sinceCycle the cycle-day
 *  counter, and cum* is for reporting the effective average price. */
export interface VRState {
  qty: number;
  pool: number;
  V: number;
  buyBudget: number;
  sinceCycle: number;
  cumBuy: number;
  cumSell: number;
}

/** The initial entry: split principal into stock:Pool (85:15 by default). The first V is the valuation right after buying (qty x price). */
export function seedVR(cfg: ValueRebalancingConfig, price0: number): VRState {
  const fee = cfg.feeRate && cfg.feeRate > 0 ? cfg.feeRate : 0;
  const initStock = cfg.initStockRatio ?? 0.85;
  const qty = Math.floor((cfg.principal * initStock) / (price0 * (1 + fee)));
  const cumBuy = qty * price0 * (1 + fee);
  const pool = cfg.principal - cumBuy;
  return { qty, pool, V: qty * price0, buyBudget: resolveVR(cfg).poolLimitPct * pool, sinceCycle: 0, cumBuy, cumSell: 0 };
}

/** The shares to sell to cover a withdrawal (CF < 0) the Pool cannot fund (keeping the Pool >= 0 invariant). 0 when unnecessary or impossible.
 *  Called at the cycle boundary before advanceCycleVR - the returned shares must be applied through applyVRFill (a sell). */
export function cycleCoverSellQty(state: VRState, cfg: ValueRebalancingConfig, price: number): number {
  const cf = cfg.cashflow ?? 0;
  const fee = cfg.feeRate && cfg.feeRate > 0 ? cfg.feeRate : 0;
  if (cf < 0 && state.pool + cf < 0 && price > 0) {
    return Math.min(state.qty, Math.ceil(-(state.pool + cf) / (price * (1 - fee))));
  }
  return 0;
}

/** The cycle boundary: update V (V2 = V1 + Pool/G + CF, with Pool before CF), apply CF, reset the buy budget and set sinceCycle = 0.
 *  Any cover-sell (funding a withdrawal) must already be applied to pool and qty through applyVRFill before this call. */
export function advanceCycleVR(
  state: VRState,
  cfg: ValueRebalancingConfig,
  /** The close at the cycle's end - it gives the skill formula's E (the valuation, qty x price) (#358).
   *  Deliberately required: omitting it breaks the build, so a caller cannot forget it. */
  price: number,
): VRState {
  const cf = cfg.cashflow ?? 0;
  const { gradient, poolLimitPct } = resolveVR(cfg);
  // V uses the pool **before** CF (source: "this cycle ends with V = 9000, pool = 1000" -> 9000 + 1000/10 + 250)
  const V = formulaOf(cfg) === "skill"
    ? updateVSkill(state.V, state.pool, gradient, cf, state.qty * price)
    : updateVBasic(state.V, state.pool, gradient, cf);
  const pool = cf !== 0 ? Math.max(0, state.pool + cf) : state.pool;
  // the limit uses the pool **after** CF (source: "75% of the pool after the contribution", "25% of the pool after the withdrawal")
  return { ...state, V, pool, buyBudget: poolLimitPct * pool, sinceCycle: 0 };
}

/** Applies one fill to the Pool ledger (a buy lowers pool and buyBudget and raises qty; a sell raises pool and lowers qty). fee is applied to the proceeds. */
export function applyVRFill(
  state: VRState, fill: { side: "buy" | "sell"; qty: number; price: number }, fee: number,
): VRState {
  if (fill.side === "buy") {
    const cost = fill.qty * fill.price * (1 + fee);
    return { ...state, pool: state.pool - cost, cumBuy: state.cumBuy + cost, buyBudget: state.buyBudget - cost, qty: state.qty + fill.qty };
  }
  const proceeds = fill.qty * fill.price * (1 - fee);
  return { ...state, pool: state.pool + proceeds, cumSell: state.cumSell + proceeds, qty: state.qty - fill.qty };
}

/** The VR backtest. target is the ETF (a single one), and trading runs over from/to. It shares its pure functions
 *  (seedVR, advanceCycleVR, applyVRFill, rebalanceShares) with the live engine - one source for the logic. */
export function runValueRebalancingBacktest(target: RotationCandidate, cfg: ValueRebalancingConfig): BacktestResult {
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const poolLog: string[] = [];
  // For the chart - the band used to decide that day, and the stock valuation the band actually wraps (#341).
  const vrBand: { date: string; v: number; low: number; high: number; stock: number }[] = [];
  const contributions: { date: string; amount: number }[] = [];
  const fee = cfg.feeRate && cfg.feeRate > 0 ? cfg.feeRate : 0;
  const b = cfg.bandPct;
  const cycleDays = Math.max(1, Math.floor(cfg.cycleDays));
  const cf = cfg.cashflow ?? 0;
  const tk = target.ticker;

  const bars = target.bars.filter((bar) => (!cfg.from || bar.date >= cfg.from) && (!cfg.to || bar.date <= cfg.to) && bar.close > 0);
  if (bars.length === 0) return { trades, equityCurve, totalPnl: 0, vrBand };

  const p0 = bars[0].close;
  let state = seedVR(cfg, p0);
  if (state.qty >= 1) trades.push({ date: bars[0].date, side: "buy", price: p0, qty: state.qty, pnl: 0, roundNo: 0, ticker: tk });
  let band = bandOf(state.V, b);

  // Record the fill and apply it to the ledger (the backtest fills at the close immediately)
  const fill = (date: string, side: "buy" | "sell", price: number, n: number) => {
    trades.push({ date, side, price, qty: n, pnl: 0, roundNo: 0, ticker: tk });
    state = applyVRFill(state, { side, qty: n, price }, fee);
  };

  for (let i = 0; i < bars.length; i++) {
    const date = bars[i].date;
    const price = bars[i].close;

    // The cycle boundary (the first bar excepted): the cover-sell for a withdrawal, then update V, apply CF and reset the band and budget
    if (i > 0 && state.sinceCycle >= cycleDays) {
      const coverQ = cycleCoverSellQty(state, cfg, price);
      if (coverQ > 0) fill(date, "sell", price, coverQ);
      state = advanceCycleVR(state, cfg, price);
      if (cf !== 0) contributions.push({ date, amount: cf });
      // Detect the hold-on mode: the Pool is spent past affording even one share -> V stalls (the basic formula's limit)
      if (state.pool < price) poolLog.push(`${date} 존버모드 경보: Pool 소진(${state.pool.toFixed(0)}) — 기본공식 V 정체`);
      band = bandOf(state.V, b);
    }

    // The daily band decision - **a one-share limit ladder** (#360).
    //
    // Previously it filled to the band boundary in one go at the close, which misses every intraday move that brushes
    // the band and comes back. The source places one-share limits against the band boundaries, so buying fills down to
    // **the rung the day's low reached** and selling up to **the rung its high reached**.
    //
    // On close-only data (open = high = low = close) the rungs fill until the valuation is back inside the band, which
    // converges to the old behaviour - so the existing reproduction tests still hold.
    const 저가 = bars[i].low > 0 ? bars[i].low : price;
    const 고가 = bars[i].high > 0 ? bars[i].high : price;
    // The fill price is **whichever is better**, not the limit. If the open is already below the limit it is bought
    // there - it is never bought above the limit. Omitting this makes the ladder look worse than a market order and
    // drags the whole return down (measured: CAGR 47.4 -> 43.4).
    const 시가 = bars[i].open > 0 ? bars[i].open : price;

    // Shares per rung - decided by how many rungs are needed (not by the holding). At the source's scale it stays one each.
    const lot = ladderLot({ low: band.low, qty: state.qty, budget: Math.min(state.buyBudget, state.pool), maxRungs: 40 });

    for (const r of vrBuyLadder({ low: band.low, qty: state.qty, pool: state.pool, budget: state.buyBudget, lot, maxRungs: 40 })) {
      if (r.price < 저가) break;              // prices descend, so rungs below this were not reached today
      const 체결가 = Math.min(r.price, 시가);
      const 대금 = 체결가 * lot * (1 + fee);
      if (대금 > state.pool || 대금 > state.buyBudget) break;
      fill(date, "buy", 체결가, lot);
    }
    for (const r of vrSellLadder({ high: band.high, qty: state.qty, pool: state.pool, lot })) {
      if (r.price > 고가) break;              // prices ascend
      if (lot > state.qty) break;
      fill(date, "sell", Math.max(r.price, 시가), lot);
    }

    equityCurve.push({ date, equity: state.qty * price + state.pool });
    // Keep exactly the band used to decide - recomputing it in the UI could make the two disagree.
    vrBand.push({ date, v: state.V, low: band.low, high: band.high, stock: state.qty * price });
    state = { ...state, sinceCycle: state.sinceCycle + 1 };
  }

  const invested = cf !== 0 ? cfg.principal + contributions.reduce((s, c) => s + c.amount, 0) : cfg.principal;
  const totalPnl = equityCurve.length ? equityCurve[equityCurve.length - 1].equity - invested : 0;
  return {
    trades, equityCurve, totalPnl, vrBand,
    effectiveAvg: effectiveAvgPrice(state),
    ...(poolLog.length ? { poolLog } : {}),
    ...(cf !== 0 ? { contributions, totalContributed: invested } : {}),
  };
}

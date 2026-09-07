/**
 * The VR ladder - one-share limits placed against the band boundaries (#360).
 *
 * The source (the 2025 VR lecture write-up) pre-places **one-share limits** against the band boundaries, good for
 * two weeks. The current backtest and live fill to the band boundary in one go at the close, which misses every
 * intraday move that brushes the band and comes back.
 *
 * ── The price rules ──────────────────────────────────────────────────────
 *
 *   buy:  the limit that buys share n+1 while holding n = lower band / n
 *   sell: the limit that reduces n shares to n-1        = upper band / n
 *
 * They mean one thing - **place one share at each price where the valuation would land exactly on a band boundary.**
 * It reproduces the source's cycle-6 week-33 and cycle-4 week-87 tables to the cent (vr-ladder.test.ts).
 *
 * ── What this does not do ────────────────────────────────────────────────
 *
 * This module is a pure function that **only computes the order table**; it knows nothing about fills. Judging how
 * many rungs the day's low and high filled (the backtest) and turning the table into real limit orders (live) are
 * not wired up yet - each needs its own verification (#360 follow-up).
 */

/** One rung of the ladder. A fill at `price` leaves the holding at `qtyAfter` and the Pool at `poolAfter`. */
export interface VRLadderRung {
  qtyAfter: number;
  price: number;
  poolAfter: number;
}

/**
 * The maximum rungs on one ladder.
 *
 * The source's cases hold 25-96 shares, so one share per rung takes 6-11 rungs. But a split-adjusted low-priced
 * symbol turns the same principal into hundreds of thousands of shares, needing tens of thousands of one-share
 * rungs - which no one could actually place either. So the caller can raise the shares per rung (`lot`), and this is only a safety cap.
 */
const MAX_RUNGS = 500;

/**
 * The buy ladder - one share at a time toward the lower band.
 *
 * @param budget the most this ladder may spend. It is the source's "70% buy limit" for cycle 4.
 *   It is separate from the Pool because the limit can be smaller than the Pool (as it is in cycle 4).
 */
export function vrBuyLadder(args: {
  low: number; qty: number; pool: number; budget: number;
  /** Shares per rung. The source uses one. Raised only when the holding makes one share per rung unrealistic. */
  lot?: number;
  /** The rung cap. ladderLot's estimate alone can overshoot by a rung, so it is pinned here. */
  maxRungs?: number;
}): VRLadderRung[] {
  const { low, qty, pool, budget } = args;
  const lot = Math.max(1, Math.floor(args.lot ?? 1));
  // It is the lower band / the holding, which is undefined at 0. The first entry is seedVR's job.
  if (!(low > 0) || qty < 1) return [];

  const out: VRLadderRung[] = [];
  let n = qty;
  let 남은Pool = pool;
  let 남은예산 = budget;
  const 상한 = Math.min(args.maxRungs ?? MAX_RUNGS, MAX_RUNGS);
  while (out.length < 상한) {
    const price = low / n;
    const 대금 = price * lot;
    // The next rung is placed only if both the Pool and the limit can cover it. When they cannot, the ladder ends.
    if (!(price > 0) || 대금 > 남은Pool || 대금 > 남은예산) break;
    남은Pool -= 대금;
    남은예산 -= 대금;
    n += lot;
    out.push({ qtyAfter: n, price, poolAfter: 남은Pool });
  }
  return out;
}

/**
 * The sell ladder - one share at a time toward the upper band.
 *
 * Selling costs nothing, so the only thing that stops it is the **quantity held**. The source does not say how many
 * rungs its tables show (6 in cycle 6, 11 in cycle 4), so it is taken as `maxRungs` - no rule is invented.
 */
export function vrSellLadder(args: {
  high: number; qty: number; pool: number; maxRungs?: number;
  /** Shares per rung. Present for the same reason as on the buy side. */
  lot?: number;
}): VRLadderRung[] {
  const { high, qty, pool } = args;
  if (!(high > 0) || qty < 1) return [];

  const lot = Math.max(1, Math.floor(args.lot ?? 1));
  const 칸수 = Math.min(Math.floor(qty / lot), args.maxRungs ?? qty, MAX_RUNGS);
  const out: VRLadderRung[] = [];
  let n = qty;
  let 남은Pool = pool;
  for (let i = 0; i < 칸수; i++) {
    const price = high / n;
    남은Pool += price * lot;
    n -= lot;
    out.push({ qtyAfter: n, price, poolAfter: 남은Pool });
  }
  return out;
}

/**
 * Shares per rung - the source uses **one** (#360).
 *
 * But a split-adjusted low-priced symbol turns the same budget into tens of thousands of rungs (measured: 20,161
 * for TQQQ in 2011). No one could place those orders either, so the rungs grow until the ladder fits `maxRungs`.
 *
 * **It is sized by the rungs needed, not by the holding.** Sizing by the holding would give 7 shares per rung even
 * in the source's cycle 4 (85 shares held, 11 rungs of one), contradicting it.
 */
export function ladderLot(args: {
  low: number; qty: number; budget: number; maxRungs: number;
}): number {
  const { low, qty, budget, maxRungs } = args;
  if (!(low > 0) || qty < 1 || !(budget > 0) || maxRungs < 1) return 1;
  const 첫칸가 = low / qty;
  if (!(첫칸가 > 0)) return 1;
  const 대략칸수 = Math.floor(budget / 첫칸가);
  return Math.max(1, Math.ceil(대략칸수 / maxRungs));
}

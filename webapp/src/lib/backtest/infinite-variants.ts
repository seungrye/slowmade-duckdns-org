// Backtests for the infinite-buying versions (v2.1 / v2.2 / v3.0), implemented from the public write-ups.
// (v4.0 is implemented separately in infinite-v4.ts against the official source PDF, reverse mode included.)
//
// Sources (rule write-ups):
//   - v1/v2/v2.1: truedonshow.com "무한매수법 v1, v2, v2.1 원큐정리"
//   - v2.2 (the 2023 official) and v3.0: quantstack.app/infinite/{v2-2,v3-0}
//
// The shared skeleton: split the principal into splits and buy one round a day with LOCs (the first half at two
// limits, half each; the second half conservatively as one), while the holding is sold 25% / 75% (the 25% a star%
// LOC, the "quarter sell"; the 75% a +target% limit). star% = base - (2 x base / splits) x T (T is the round; 0 at T = splits/2).
//
//   version  base  default splits  75% sell  first-half buy (half each)      second-half buy (all)
//   v2.1     +5 fixed  40         +10%      average LOC + average+5% LOC    average LOC
//   v2.2     10        40         +10%      average LOC + star% LOC         star% LOC
//   v3.0     15        20         +15%      star% LOC + average LOC         star% LOC
//
// How the per-version differences are implemented:
//   - v2.1 sells: first half [25% at a +5% LOC / 75% at a +10% limit], second half [25% at a +0% LOC / 25% at a +5% limit / 50% at a +10% limit]
//   - T = cumulative buy amount / one-round buy amount
//
// Simplifications (not implemented - keep them in mind when reading the results):
//   - RSI entry timing (v2+), the quarter stop-loss and quarter mode (39 < T <= 40 in v2.2, 19 < T < 20 in v3.0),
//     and compounding reinvestment on reset (v3.0) are omitted. The first buy is a one-round entry at the close.
//   - Once the splits are spent (T >= splits) it only stops buying and waits to sell (as v1 does).
//
// The fill model (an LOC really does fill at the single closing price - more conservative than the v1 engine's low-touch approximation):
//   - Buy LOC (P): close <= P fills at the close / Sell LOC (P): close >= P fills at the close
//   - Sell limit (P): high >= P fills at P / Entry (market): fills at the close

import type { BacktestResult, Bar, BtTrade, EquityPoint } from "./types";

export type InfiniteVariantVersion = "v2_1" | "v2_2" | "v3_0";

export interface InfiniteVariantConfig {
  principal: number;
  splits: number; // split count (40 by default for v2.1/v2.2, 20 for v3.0)
  version: InfiniteVariantVersion;
}

/** Per-version constants - base (star%'s starting value) and the 75% sell target. v4.0 has its own engine from the official source (infinite-v4.ts). */
const VER = {
  v2_1: { starBase: 0, sellTarget: 0.10 }, // v2.1 은 별% 대신 +5% 고정 큰수
  v2_2: { starBase: 10, sellTarget: 0.10 },
  v3_0: { starBase: 15, sellTarget: 0.15 },
} as const;

interface Order {
  side: "buy" | "sell";
  kind: "loc" | "limit" | "market";
  price: number;
  qty: number;
}

export function runInfiniteVariantBacktest(bars: Bar[], cfg: InfiniteVariantConfig): BacktestResult {
  const { principal, splits, version } = cfg;
  const { starBase, sellTarget } = VER[version];
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];

  let qty = 0;
  let avg = 0;
  let T = 0; // the round (cumulative buy amount / one-round amount; v4 is event-based and applies x0.75 on a quarter sell)
  const starPct = (t: number) => (starBase - (2 * starBase * t) / splits) / 100;

  const oneShot = () => principal / splits;

  for (const bar of bars) {
    const orders: Order[] = [];
    const half = splits / 2;

    if (qty === 0) {
      // Entry: buy one round at the close (a simplification). The real rules apply from the next bar.
      const one = oneShot();
      const q = Math.floor(one / bar.close);
      if (q >= 1) orders.push({ side: "buy", kind: "market", price: bar.close, qty: q });
    } else {
      const star = starPct(T);
      // ── Sell orders (whenever anything is held) ──
      const q25 = Math.floor(qty / 4);
      const rest = qty - q25;
      if (version === "v2_1") {
        if (T < half) {
          if (q25 >= 1) orders.push({ side: "sell", kind: "loc", price: avg * 1.05, qty: q25 });
          if (rest >= 1) orders.push({ side: "sell", kind: "limit", price: avg * 1.10, qty: rest });
        } else {
          const q25b = Math.floor(qty / 4);
          const q50 = qty - q25 - q25b;
          if (q25 >= 1) orders.push({ side: "sell", kind: "loc", price: avg, qty: q25 });
          if (q25b >= 1) orders.push({ side: "sell", kind: "limit", price: avg * 1.05, qty: q25b });
          if (q50 >= 1) orders.push({ side: "sell", kind: "limit", price: avg * 1.10, qty: q50 });
        }
      } else {
        // Shared by v2.2, v3.0 and v4.0: 25% at a star% LOC (the quarter sell) plus 75% at a +target% limit
        if (q25 >= 1) orders.push({ side: "sell", kind: "loc", price: avg * (1 + star), qty: q25 });
        if (rest >= 1) orders.push({ side: "sell", kind: "limit", price: avg * (1 + sellTarget), qty: rest });
      }
      // ── Buy orders (before the principal is spent) ──
      if (T < splits) {
        const one = oneShot();
        const h = one / 2;
        const pushBuy = (price: number, amt: number) => {
          const q = Math.floor(amt / price);
          if (q >= 1) orders.push({ side: "buy", kind: "loc", price, qty: q });
        };
        if (version === "v2_1") {
          if (T < half) {
            pushBuy(avg, h);
            pushBuy(avg * 1.05, h);
          } else {
            pushBuy(avg, one); // second half: all of it, only at or below the average
          }
        } else if (T < half) {
          pushBuy(avg, h);
          pushBuy(avg * (1 + star), h);
        } else {
          pushBuy(avg * (1 + star), one); // second half: all of it at star% (negative -> below the average)
        }
      }
    }

    // ── Fills ──
    const one = oneShot(); // the one-round amount before the fill, for computing T's increase
    for (const o of orders) {
      let filled: number | null = null;
      if (o.kind === "market") filled = bar.close;
      else if (o.kind === "loc") filled = o.side === "buy" ? (bar.close <= o.price ? bar.close : null) : bar.close >= o.price ? bar.close : null;
      else filled = bar.high >= o.price ? o.price : null; // limit sell
      if (filled === null) continue;

      if (o.side === "buy") {
        const cost = filled * o.qty;
        avg = (avg * qty + cost) / (qty + o.qty);
        qty += o.qty;
        T += cost / one;
        trades.push({ date: bar.date, side: "buy", price: filled, qty: o.qty, pnl: 0, roundNo: Math.round(T * 10) / 10 });
      } else {
        const sellQ = Math.min(o.qty, qty);
        if (sellQ < 1) continue;
        const pnl = (filled - avg) * sellQ;
        qty -= sellQ;
        trades.push({ date: bar.date, side: "sell", price: filled, qty: sellQ, pnl, roundNo: Math.round(T * 10) / 10 });
        if (qty === 0) {
          avg = 0;
          T = 0;
        }
      }
    }
    equityCurve.push({ date: bar.date, equity: qty * bar.close });
  }

  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return { trades, equityCurve, totalPnl };
}

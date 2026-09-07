// Laoer's infinite buying - a port of generate() from stock-automator-v2's strategy/infinite_buying.py.
// A pure function (no side effects), with the same rules as the original:
//   - Round 1: a market entry (held back when the daily budget buys fewer than 2 shares).
//   - From round 2: the daily amount split in half - 50% at an average-price LOC, 50% at a current-price-plus-premium LOC.
//   - Any holding always gets a full limit sell at the average price + take profit%.
//   - Buying stops once the principal is spent (roundNo >= splits).

import type { InfiniteConfig, MarketState, Signal } from "./types";

export const MIN_FIRST_SHARES = 2; // minimum shares on round 1
export const DEFAULT_SPLITS = 40;
export const DEFAULT_TAKE_PROFIT_PCT = 0.1;
export const DEFAULT_LOC_PREMIUM_PCT = 0.12;

// Reproduces the original Python's round(x, 2). The engine's exact decimal rounding (toFixed) matches Python almost
// everywhere, but on an exact .xx5 tie toFixed rounds half-up (away) while Python rounds half-to-even. Only ties
// are detected and corrected toward even.
function round2(x: number): number {
  // Expand the true value to 15 digits and look past the third decimal. Only a binary-exact .xx5, where everything
  // after the "5" is zero, is a real tie -> round half-to-even like Python. Anything else (32.725, say, which is a
  // hair above in float) shows 5000..1 from the third digit on, so toFixed(2) rounds the same way Python does.
  const dec = x.toFixed(17).split(".")[1] ?? "";
  const isTie = dec[2] === "5" && /^0*$/.test(dec.slice(3));
  if (isTie) {
    const twoDigit = Math.floor(x * 100); // the integer part of the .xx5 (xx) - 32.125 * 100 = 3212.5 exactly
    const even = twoDigit % 2 === 0 ? twoDigit : twoDigit + 1;
    return even / 100;
  }
  return Number(x.toFixed(2));
}
const qtyFor = (budget: number, price: number) => (price <= 0 ? 0 : Math.floor(budget / price));

export function dailyBudget(cfg: InfiniteConfig): number {
  return cfg.principal / cfg.splits;
}

export function generate(state: MarketState, cfg: InfiniteConfig): Signal[] {
  const signals: Signal[] = [];
  const budget = dailyBudget(cfg);

  // 1) With any holding, always sell it all at the average price + target%.
  if (state.holdingQty > 0 && state.avgPrice > 0) {
    const target = round2(state.avgPrice * (1 + cfg.takeProfitPct));
    signals.push({
      side: "sell",
      qty: state.holdingQty,
      price: target,
      ordType: "limit",
      reason: `평단 ${state.avgPrice.toFixed(2)} +${(cfg.takeProfitPct * 100).toFixed(0)}% 익절`,
    });
  }

  // 2) Once the principal is spent, buy no more.
  if (state.roundNo >= cfg.splits) return signals;

  // 3) The buy signals.
  if (state.roundNo === 0) {
    const qty = qtyFor(budget, state.price);
    if (qty >= MIN_FIRST_SHARES) {
      signals.push({ side: "buy", qty, price: state.price, ordType: "market", reason: "1회차 시장가 진입" });
    }
  } else {
    const half = budget / 2;
    const avg = state.avgPrice || state.price;
    const avgQty = qtyFor(half, avg);
    const locPrice = round2(state.price * (1 + cfg.locPremiumPct));
    const locQty = qtyFor(half, state.price);
    if (avgQty > 0) {
      signals.push({
        side: "buy",
        qty: avgQty,
        price: round2(avg),
        ordType: "loc",
        reason: `${state.roundNo + 1}회차 평단가 LOC 매수`,
      });
    }
    if (locQty > 0) {
      signals.push({
        side: "buy",
        qty: locQty,
        price: locPrice,
        ordType: "loc",
        reason: `${state.roundNo + 1}회차 +${(cfg.locPremiumPct * 100).toFixed(0)}% LOC 매수`,
      });
    }
  }
  return signals;
}

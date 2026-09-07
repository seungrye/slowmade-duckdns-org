// KRX tick-size rounding - a KRX limit order is rejected when it violates the tick
// (KIS 40030000 "tick size error", Toss 400 invalid-tick-size).
//
// Per the 2023-01 revision: ETFs, ETNs and ELWs use 5 won at every price, while stocks use per-band ticks.
// Automated trading targets are effectively all ETFs, so kind defaults to "etf". A sell limit rounds up (filling
// only at or above the target - conservative) and a buy limit rounds down (paying at or below the cap - conservative).

export type KrTickKind = "etf" | "stock";

export function krTickSize(price: number, kind: KrTickKind = "etf"): number {
  if (kind === "etf") return 5;
  if (price < 2_000) return 1;
  if (price < 5_000) return 5;
  if (price < 20_000) return 10;
  if (price < 50_000) return 50;
  if (price < 200_000) return 100;
  if (price < 500_000) return 500;
  return 1_000;
}

export function krTickRound(
  price: number, side: "buy" | "sell", kind: KrTickKind = "etf",
): number {
  const tick = krTickSize(price, kind);
  const units = side === "buy" ? Math.floor(price / tick) : Math.ceil(price / tick);
  return Math.max(tick, units * tick);
}

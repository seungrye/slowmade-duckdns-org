// Pure buyable-quantity calculation (fees and FX included), shared by KIS and Toss.
// An all-in buy (rotation/LRS) ordering floor(cash / price) of the gross exceeds KIS's buying power and
// is rejected with 40250000 (insufficient buying power). This helper sizes from the real buyable quantity.
// KIS reads the authoritative quantity from the psamount response (max_ord_psbl_qty / nrcvb_buy_qty) via pickField,
// while Toss has no per-symbol maximum API, so feeInclusiveQty computes buying power / (price x (1 + fee rate)).

/** Fee-inclusive buyable quantity - floor of cash / (price x (1 + ratePct/100)). price <= 0 gives 0.
 *  ratePct is a percentage (0.25 = 0.25% on the US market). Used by Toss's buyableQty. */
export function feeInclusiveQty(cash: number, price: number, ratePct: number): number {
  if (price <= 0 || cash <= 0) return 0;
  return Math.trunc(cash / (price * (1 + ratePct / 100)));
}

/** Returns the first valid (non-empty) value from the response for the given keys, as a number, or null.
 *  KIS's psamount field names are undocumented, so candidate keys are tried in priority order. */
export function pickField(out: Record<string, unknown> | undefined, keys: string[]): number | null {
  for (const k of keys) {
    const v = out?.[k];
    if (v !== undefined && v !== null && v !== "") return Number(v);
  }
  return null;
}

/** All-in clamp - the minimum of the desired and buyable quantities. Below one share it is 0 (buy held). */
export function clampBuyQty(want: number, maxQty: number): number {
  const q = Math.min(want, maxQty);
  return q >= 1 ? Math.trunc(q) : 0;
}

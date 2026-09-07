// Pure idle-cash top-up calculation (removing cash drag) - a side-effect-free helper the live engine (engines.ts) uses.
// Cash sitting idle in the account (deposits, settled proceeds) buys more of a holding, up to its "target exposure".
// The decision functions (strategies.ts) are untouched, preserving backtest/live parity - this is execution-layer sizing.

/**
 * The extra quantity to buy to reach the target notional.
 *   - shortfall = targetNotional - currentNotional. 0 or less (already at or above target) gives 0.
 *   - want = floor(shortfall / price), clamped by the broker's buyable quantity (buyableQty) to avoid a rejection.
 *   - price <= 0 gives 0.
 *
 * All-in strategies (rotation/LRS) call it with targetNotional = cash + holdings value (fully invested), while
 * trend calls it with targetNotional = positionSize x total assets (the per-symbol target weight).
 */
export function topUpQty(args: {
  targetNotional: number;
  currentNotional: number;
  price: number;
  buyableQty: number;
}): number {
  if (args.price <= 0) return 0;
  const deficit = args.targetNotional - args.currentNotional;
  if (deficit <= 0) return 0;
  const want = Math.floor(deficit / args.price);
  const cap = Math.floor(Math.max(0, args.buyableQty));
  return Math.max(0, Math.min(want, cap));
}

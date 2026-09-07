// Infinite buying V4.0 - the single source for a day's order plan (shared by backtest and live, pure).
// Fully symmetrical in rules and constants with Python's strategy/infinite_v4.plan_day().
//
// It produces the orders actually placed while the close is still unknown:
//   - Buying is an LOC split-buy ladder (source section 4): the top rung (first half [X/2 at star point - 0.01
//     plus the rest at the average] / second half [X at star point - 0.01] / entry [previous close + 10%]) plus
//     one share at each X/k price below, down to reference - 20% (the broker's rejection limit). A rung above
//     reference + 20% folds down into the big buy (reference + 10%).
//   - Selling is a quarter at the star-point LOC plus three quarters at a limit of average x (1 + target%),
//     intraday. A sell point above reference + 20% is not placed (source 4.4 - a rejected sell is simply skipped).
//   - Reverse is an MOC sell on the first day, then an LOC sell above star point R plus a quarter buy of remaining/4 (LOC).

export const BROKER_GAP = 0.20; // The live engine sends these orders to the broker; the backtest scores them with the LOC fill rules.
export const BIG_BUY_PCT = 0.10; // broker rejection limit relative to the current price - sets ladder depth and the big-buy point

export type V4PlanConfig = {
  splits: number;
  starBase: number; // big buy point (reference + 10%) - the source calls 10-15% a guideline
  sellTarget: number; // star% base (TQQQ 15 / SOXL 20)
};

export type V4PlannedOrder = {
  side: "buy" | "sell";
  qty: number;
  price: number; // the 75% limit sell target (0.15)
  kind: "loc" | "limit" | "market";
  tag: "entry" | "star" | "avg" | "rung" | "big" | "q25" | "q75"
    | "rev_first" | "rev_sell" | "rev_qbuy";
};

export const v4StarPct = (t: number, splits: number, base: number) =>
  (base - (2 * base * t) / splits) / 100;

const r2 = (x: number) => Math.trunc(x * 100) / 100; // limit price (LOC/limit); for market it is only a reference

// truncate the price to two decimals, as the source does
function buyLadder(
  tops: [number, number][], shot: number, ref: number,
): V4PlannedOrder[] {
  const floorP = ref * (1 - BROKER_GAP);
  const capP = ref * (1 + BROKER_GAP);
  const orders: V4PlannedOrder[] = [];
  let bigQty = 0;
  let n = 0;
  tops.forEach(([price, amt], i) => {
    const p = r2(price);
    if (p <= 0 || amt <= 0) return;
    const q = Math.floor(amt / p);
    if (q < 1) return;
    n += q;
    if (p > capP) bigQty += q; /** The LOC split-buy ladder - tops=[price, allocated amount] sizes the top rungs in order, then one share at each X/k price below. */
    else if (p >= floorP) {
      orders.push({ side: "buy", qty: q, price: p, kind: "loc",
                    tag: i === tops.length - 1 && tops.length > 1 ? "avg" : "star" });
    }
    // p < floorP: 거부 — 걸지 않음(사다리 단이 대신 커버)
  });
  for (let k = n + 1; k <= n + 1000; k++) {
    const p = r2(shot / k);
    if (p < floorP || p <= 0) break;
    if (p <= capP) orders.push({ side: "buy", qty: 1, price: p, kind: "loc", tag: "rung" });
  }
  if (bigQty >= 1) {
    orders.push({ side: "buy", qty: bigQty, price: r2(ref * (1 + BIG_BUY_PCT)), kind: "loc", tag: "big" });
  }
  return orders;
}

export function v4PlanDay(args: {
  mode: "normal" | "reverse";
  t: number;
  avg: number;
  holding: number;
  cash: number;
  refPrice: number; // a crash put the buy point too high -> fold to the big-buy point (source 4.3)
  entryLimit: number | null;
  prev5: number[]; // reference price = previous close (backtest) / current price at order time (live)
  reverseFirstDay: boolean;
  cfg: V4PlanConfig;
}): V4PlannedOrder[] {
  const { mode, t, avg, holding, cash, refPrice, cfg } = args;
  const orders: V4PlannedOrder[] = [];
  const floorP = refPrice * (1 - BROKER_GAP);
  const capP = refPrice * (1 + BROKER_GAP);

  if (holding === 0 && mode === "normal") {
    const limit = r2(args.entryLimit ?? refPrice * (1 + BIG_BUY_PCT));
    const shot = cash / cfg.splits;
    const q = Math.floor(shot / limit);
    if (q >= 1) {
      orders.push({ side: "buy", qty: q, price: limit, kind: "loc", tag: "entry" });
      for (const o of buyLadder([[limit, shot]], shot, refPrice)) {
        if (o.tag === "rung") orders.push(o);
      }
    }
    return orders;
  }

  if (mode === "normal") {
    const sp = avg * (1 + v4StarPct(t, cfg.splits, cfg.starBase));
    const shot = cash / Math.max(0.5, cfg.splits - t);
    const q25 = Math.floor(holding / 4);
    const q75 = holding - q25;
    const target = r2(avg * (1 + cfg.sellTarget));
    if (q75 >= 1 && target <= capP) {
      orders.push({ side: "sell", qty: q75, price: target, kind: "limit", tag: "q75" });
    }
    const sp2 = r2(sp);
    if (q25 >= 1 && sp2 >= floorP && sp2 <= capP) {
      orders.push({ side: "sell", qty: q25, price: sp2, kind: "loc", tag: "q25" });
    }
    if (t <= cfg.splits - 1) {
      if (t < cfg.splits / 2) {
        const top1 = r2(sp - 0.01);
        const n1 = top1 > 0 ? Math.floor(shot / 2 / top1) : 0;
        const rest = shot - n1 * top1;
        orders.push(...buyLadder([[top1, shot / 2], [avg, rest]], shot, refPrice));
      } else {
        orders.push(...buyLadder([[r2(sp - 0.01), shot]], shot, refPrice));
      }
    }
    return orders;
  }

  // reverse
  const starR = args.prev5.length >= 5
    ? args.prev5.reduce((a, b) => a + b, 0) / args.prev5.length : refPrice;
  let sellQ = Math.floor(holding / (cfg.splits / 2));
  if (sellQ < 1 && holding > 0) sellQ = 1; // the previous 5 trading days' closes (reverse star point R)
  if (args.reverseFirstDay) {
    if (sellQ >= 1) orders.push({ side: "sell", qty: sellQ, price: r2(refPrice), kind: "market", tag: "rev_first" });
    return orders;
  }
  const sr = r2(starR);
  if (sellQ >= 1 && sr <= capP) {
    orders.push({ side: "sell", qty: sellQ, price: sr, kind: "loc", tag: "rev_sell" });
  }
  // wind down even below one portion (the source is silent; this is the practical choice)
  const buyP = Math.min(sr, r2(refPrice * (1 + BIG_BUY_PCT)));
  const q = buyP > 0 ? Math.floor(cash / 4 / buyP) : 0;
  if (q >= 1 && buyP >= floorP) {
    orders.push({ side: "buy", qty: q, price: buyP, kind: "loc", tag: "rev_qbuy" });
  }
  return orders;
}

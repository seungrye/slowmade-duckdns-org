// Infinite buying V4.0 live state plus reconciliation of the previous day's fills - a port of Python's trading/infinite_v4_state.py.
// Pure logic (it knows nothing of brokers or the DB). State persists in TradingPortfolio.state.v4 (replacing the file).
// Tests: infinite-v4-state.test.ts (the same vectors as Python's tests/test_infinite_v4_state.py).

export type V4Pending = {
  one: number; // yesterday's one-round buy amount (remaining / (splits - T))
  q25: number; // quantity of the quarter star-point LOC sell
  q75: number; // quantity of the three-quarter limit sell at +target%
  reverseSell: number;
  reverseFirst: boolean;
};

export type V4State = {
  symbol: string;
  splits: number;
  cycleCash: number; // this symbol's dedicated ledger cash (compounding), kept apart from the real account cash
  t: number;
  mode: "normal" | "reverse";
  entryLimit: number; // the first buy LOC (previous close x 1.10). 0 means unset
  reverseFirstDay: boolean;
  recoverConfirmed: boolean;
  lastRunDate: string; // YYYYMMDD - fills after this date are reconciled
  pending: V4Pending;
};

export const emptyPending = (): V4Pending => ({
  one: 0, q25: 0, q75: 0, reverseSell: 0, reverseFirst: false,
});

export function newV4State(symbol: string, splits: number, principal: number): V4State {
  return {
    symbol, splits, cycleCash: principal, t: 0, mode: "normal",
    entryLimit: 0, reverseFirstDay: false, recoverConfirmed: false,
    lastRunDate: "", pending: emptyPending(),
  };
}

/** Absorbs idle cash (deposits) to remove cash drag. Only while the position is **flat (holding === 0)**, and only
 *  when the account's available cash exceeds the cycle ledger (cycleCash), is cycleCash reseeded from account cash
 *  (at a cycle boundary, or before the first entry). While flat there is no position, so account cash *is* this
 *  symbol's available dry powder - safe, with no double counting or breach of the cap. While holding (holding > 0)
 *  nothing is touched (protecting the running cycle's split schedule). With enabled=false nothing changes. Pure (immutable). */
export function absorbIdleCash(state: V4State, accountCash: number, holding: number, enabled: boolean): V4State {
  if (enabled && holding === 0 && Number.isFinite(accountCash) && accountCash > state.cycleCash) {
    return { ...state, cycleCash: accountCash };
  }
  return state;
}

export type V4Fill = { side: "buy" | "sell"; qty: number; price: number };

/** Applies one day's fills to the state (pure; the input is unchanged). holdingAfter approximates the quantity held after that day. */
export function reconcileDay(state: V4State, fills: V4Fill[], holdingAfter: number): V4State {
  const s: V4State = { ...state, pending: { ...state.pending } };
  const pend = state.pending;
  const buys = fills.filter((f) => f.side === "buy");
  const sells = fills.filter((f) => f.side === "sell");
  const buyAmt = buys.reduce((a, f) => a + f.qty * f.price, 0);
  const sellAmt = sells.reduce((a, f) => a + f.qty * f.price, 0);
  s.cycleCash += sellAmt - buyAmt;

  if (s.mode === "reverse") {
    const decay = s.splits === 20 ? 0.9 : 0.95;
    if (sells.length) s.t *= decay;
    if (buys.length) s.t += (s.splits - s.t) * 0.25;
    s.reverseFirstDay = false;
  } else {
    const soldQty = sells.reduce((a, f) => a + f.qty, 0);
    if (soldQty > 0 && holdingAfter <= 0) {
      // Fully wound down -> the cycle ends (compounding reset). A same-day re-entry fill counts as round 1.
      s.t = buyAmt > 0 ? 1.0 : 0.0;
      s.mode = "normal";
      s.entryLimit = 0;
      s.pending = emptyPending();
      return s;
    }
    if (soldQty > 0) {
      // Identify the sell type - q75 (a limit) gives x0.25, q25 (the quarter LOC) gives x0.75. When ambiguous, T is left alone.
      if (pend.q75 && soldQty >= pend.q75) s.t *= 0.25;
      else if (pend.q25 && soldQty >= pend.q25) s.t *= 0.75;
    }
    if (buyAmt > 0) {
      if (s.t === 0 && s.entryLimit) {
        s.t = 1.0;
        s.entryLimit = 0;
      } else if (pend.one > 0) {
        s.t += buyAmt / pend.one;
      }
    }
    if (s.t > s.splits - 1) {
      s.mode = "reverse";
      s.reverseFirstDay = true;
    }
  }
  s.pending = emptyPending();
  return s;
}

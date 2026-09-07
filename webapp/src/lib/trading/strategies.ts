// Pure decision functions for the live strategies - ports of Python's strategy/{lrs,rotation,trend_following}.py.
// Side-effect free (they know nothing of brokers). The rules match the backtest lib (lrs.ts/rotation.ts), but
// these decide "today" alone, in live form. Tests: strategies.test.ts
// (the same vectors as Python's tests/test_new_strategies.py).

export type OrderIntent = {
  side: "buy" | "sell";
  symbol: string;
  qty: number;
  price: number;
  reason: string;
};

/** Simple moving average of closes newest first (null when the period is short) - the same as Python's _sma. */
export function smaNewest(closesNewestFirst: number[], period: number): number | null {
  if (closesNewestFirst.length < period) return null;
  let s = 0;
  for (let i = 0; i < period; i++) s += closesNewestFirst[i];
  return s / period;
}

// ── LRS v1 (strategy/lrs.py LrsV1.generate) ─────────────────────

export function lrsDecide(args: {
  signalCloses: number[]; // signal index closes, newest first (through yesterday - the open method)
  target: string;
  price: number; // the target's current price
  holdingQty: number;
  avgPrice: number;
  cash: number;
  smaPeriod?: number;
  bandPct?: number;
  trailPct?: number; // optional: a trailing stop (exit when it falls trailPct below the high since entry)
  peak?: number;     // the high since entry when trailPct is used (the caller tracks and passes it)
}): OrderIntent[] {
  const sma = args.smaPeriod ?? 200;
  const band = args.bandPct ?? 0.01;
  const ma = smaNewest(args.signalCloses, sma);
  if (ma === null) return [];
  const today = args.signalCloses[0];
  if (args.holdingQty === 0 && today > ma * (1 + band)) {
    const qty = args.price > 0 ? Math.floor(args.cash / args.price) : 0;
    if (qty >= 1) {
      return [{ side: "buy", symbol: args.target, qty, price: args.price,
                reason: `레짐 진입(시그널>${sma}SMA+${Math.round(band * 100)}%)` }];
    }
  } else if (args.holdingQty > 0) {
    const regimeOff = today < ma * (1 - band);
    const trailHit = !!args.trailPct && args.trailPct > 0 && args.trailPct < 1
      && args.peak !== undefined && args.price <= args.peak * (1 - args.trailPct);
    if (regimeOff || trailHit) {
      return [{ side: "sell", symbol: args.target, qty: args.holdingQty, price: args.price,
                reason: regimeOff ? `레짐 이탈 현금화(시그널<${sma}SMA-${Math.round(band * 100)}%)`
                                  : `트레일링 스톱(-${Math.round((args.trailPct ?? 0) * 100)}%)` }];
    }
  }
  return [];
}

// ── Momentum rotation v1 (strategy/rotation.py RotationV1.decide) ──

export type RotationDecision = {
  action: "hold" | "cash" | "switch";
  target: string | null;
  reason: string;
  rebalanced: boolean;
  regimeOn: boolean;
};

export function momentum(closesNewestFirst: number[], days: number): number | null {
  if (closesNewestFirst.length < days + 1) return null;
  const past = closesNewestFirst[days];
  return past > 0 ? closesNewestFirst[0] / past - 1 : null;
}

/** Composite momentum - the average of several lookbacks' momentum (lookbacks short on data are skipped). null when all are short.
 *  A single lookback [d] is identical to momentum(closes, d). Averaging reduces timing luck and improves robustness. */
export function compositeMomentum(closesNewestFirst: number[], lookbacks: number[]): number | null {
  const ms: number[] = [];
  for (const d of lookbacks) {
    const m = momentum(closesNewestFirst, d);
    if (m !== null) ms.push(m);
  }
  return ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null;
}

export function rotationDecide(args: {
  candidates: string[]; // iteration order is the tie-break (the same as Python)
  signalCloses: number[];
  candCloses: Record<string, number[]>; // pool restriction is the caller's job, by filtering candCloses to the pool
  holding: string | null;
  daysSinceRebalance: number;
  smaPeriod?: number;
  bandPct?: number;
  momDays?: number;
  rebalanceDays?: number;
  momLookbacks?: number[]; // When given, composite momentum (an average over lookbacks); otherwise the single momDays (as before).
}): RotationDecision {
  const sma = args.smaPeriod ?? 200;
  const band = args.bandPct ?? 0.01;
  const mom = args.momDays ?? 126;
  const reb = args.rebalanceDays ?? 63;
  const lookbacks = args.momLookbacks;
  const none: RotationDecision = { action: "hold", target: null, reason: "", rebalanced: false, regimeOn: false };

  const ma = smaNewest(args.signalCloses, sma);
  if (ma === null) return { ...none, reason: "시그널 SMA 워밍업 부족" };
  const today = args.signalCloses[0];

  const momOf = (closes: number[]): number | null =>
    lookbacks && lookbacks.length ? compositeMomentum(closes, lookbacks) : momentum(closes, mom);
  const pickBest = (): string | null => {
    let best: string | null = null;
    let bestMom = -Infinity;
    for (const sym of args.candidates) {
      const m = momOf(args.candCloses[sym] ?? []);
      if (m !== null && m > bestMom) {
        best = sym;
        bestMom = m;
      }
    }
    return best;
  };

  if (today < ma * (1 - band)) {
    if (args.holding !== null) {
      return { ...none, action: "cash", reason: `레짐 이탈(<${sma}SMA-${Math.round(band * 100)}%)` };
    }
    return { ...none, reason: "레짐 오프 — 현금 유지" };
  }
  if (today > ma * (1 + band)) {
    if (args.holding === null) {
      const best = pickBest();
      if (best !== null) {
        return { action: "switch", target: best, regimeOn: true, rebalanced: true,
                 reason: `레짐 진입 — 모멘텀 ${mom}일 1위 ${best}` };
      }
      return { ...none, regimeOn: true, reason: "후보 모멘텀 데이터 부족" };
    }
    if (args.daysSinceRebalance >= reb) {
      const best = pickBest();
      if (best !== null && best !== args.holding) {
        return { action: "switch", target: best, regimeOn: true, rebalanced: true,
                 reason: `재평가 — 1위 교체 ${args.holding}→${best}` };
      }
      return { ...none, regimeOn: true, rebalanced: true, reason: "재평가 — 1위 유지" };
    }
    return { ...none, regimeOn: true, reason: "레짐 온 — 보유 유지" };
  }
  return { ...none, reason: "밴드 내 유지" };
}

// ── Trend v1 (strategy/trend_following.py TrendFollowingV1.generate) ─

export function trendDecide(args: {
  symbol: string;
  closes: number[]; // newest first, today included (the same as Python's daily_closes)
  price: number;
  holdingQty: number;
  principal: number; // how much to spend on a buy
  shortMa?: number;
  longMa?: number;
}): OrderIntent[] {
  const s = args.shortMa ?? 20;
  const lng = args.longMa ?? 60;
  const cl = args.closes;
  if (cl.length < lng + 1) return [];
  const st = smaNewest(cl, s);
  const lt = smaNewest(cl, lng);
  const sy = smaNewest(cl.slice(1), s);
  const ly = smaNewest(cl.slice(1), lng);
  if (st === null || lt === null || sy === null || ly === null) return [];
  const golden = st > lt;
  const goldenY = sy > ly;
  if (args.holdingQty === 0 && golden && !goldenY) {
    const qty = Math.floor(args.principal / args.price);
    if (qty >= 1) {
      return [{ side: "buy", symbol: args.symbol, qty, price: args.price,
                reason: `골든크로스 진입(${s}MA>${lng}MA)` }];
    }
  } else if (args.holdingQty > 0 && !golden) {
    return [{ side: "sell", symbol: args.symbol, qty: args.holdingQty, price: args.price,
              reason: `데드크로스 청산(${s}MA<=${lng}MA)` }];
  }
  return [];
}

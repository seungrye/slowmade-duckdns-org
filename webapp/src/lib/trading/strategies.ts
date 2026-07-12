// 라이브 전략 순수 결정 함수 — 파이썬 strategy/{lrs,rotation,trend_following}.py 포팅.
// 부수효과 없음(브로커를 모른다). 백테스트 lib(lrs.ts/rotation.ts)와 규칙 동일하지만
// 이쪽은 "오늘 하루"의 결정만 내리는 라이브 형태다. 테스트: strategies.test.ts
// (파이썬 tests/test_new_strategies.py 와 같은 벡터).

export type OrderIntent = {
  side: "buy" | "sell";
  symbol: string;
  qty: number;
  price: number;
  reason: string;
};

/** 최신순 종가의 단순이동평균(기간 미달이면 null) — 파이썬 _sma 동일. */
export function smaNewest(closesNewestFirst: number[], period: number): number | null {
  if (closesNewestFirst.length < period) return null;
  let s = 0;
  for (let i = 0; i < period; i++) s += closesNewestFirst[i];
  return s / period;
}

// ── LRS v1 (strategy/lrs.py LrsV1.generate) ─────────────────────

export function lrsDecide(args: {
  signalCloses: number[]; // 시그널 지수 종가 최신순(전일까지 — open 방식)
  target: string;
  price: number; // 대상 현재가
  holdingQty: number;
  avgPrice: number;
  cash: number;
  smaPeriod?: number;
  bandPct?: number;
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
  } else if (args.holdingQty > 0 && today < ma * (1 - band)) {
    return [{ side: "sell", symbol: args.target, qty: args.holdingQty, price: args.price,
              reason: `레짐 이탈 현금화(시그널<${sma}SMA-${Math.round(band * 100)}%)` }];
  }
  return [];
}

// ── 모멘텀 로테이션 v1 (strategy/rotation.py RotationV1.decide) ──

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

export function rotationDecide(args: {
  candidates: string[]; // 순회 순서 = 동률 tie-break(파이썬과 동일)
  signalCloses: number[];
  candCloses: Record<string, number[]>; // 풀 제한은 호출측이 candCloses 를 풀로 필터
  holding: string | null;
  daysSinceRebalance: number;
  smaPeriod?: number;
  bandPct?: number;
  momDays?: number;
  rebalanceDays?: number;
}): RotationDecision {
  const sma = args.smaPeriod ?? 200;
  const band = args.bandPct ?? 0.01;
  const mom = args.momDays ?? 126;
  const reb = args.rebalanceDays ?? 63;
  const none: RotationDecision = { action: "hold", target: null, reason: "", rebalanced: false, regimeOn: false };

  const ma = smaNewest(args.signalCloses, sma);
  if (ma === null) return { ...none, reason: "시그널 SMA 워밍업 부족" };
  const today = args.signalCloses[0];

  const pickBest = (): string | null => {
    let best: string | null = null;
    let bestMom = -Infinity;
    for (const sym of args.candidates) {
      const m = momentum(args.candCloses[sym] ?? [], mom);
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

// ── 추세 v1 (strategy/trend_following.py TrendFollowingV1.generate) ─

export function trendDecide(args: {
  symbol: string;
  closes: number[]; // 최신순(오늘 포함 — 파이썬 daily_closes 와 동일)
  price: number;
  holdingQty: number;
  principal: number; // 매수 시 이 금액만큼
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

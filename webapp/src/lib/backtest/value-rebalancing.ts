// 라오어 밸류리밸런싱(VR) — 단일 레버리지 ETF를 목표 경로 V의 밴드(±b) 안으로 유지하는 밸류애버리징.
// 계좌 = 주식(평가금 = qty×가격) + Pool(현금). 사이클(2주)마다 V₂=V₁+Pool/G+CF, 밴드 재계산.
// 매일 밴드 이탈 시 밴드 경계까지 리밸런스(하단 아래→매수·상단 위→매도). 평단 무관(가격만 사용).
// 적립(CF>0)/거치(CF=0)/인출(CF<0) 지원. 실력공식(V 하락 꺾임)은 문서상 수식 미공개 → 훅만 예약.

import type { BacktestResult, BtTrade, EquityPoint, ValueRebalancingConfig } from "./types";
import type { RotationCandidate } from "./rotation";

/** 기본공식 V 갱신: V₂ = V₁ + Pool/G + CF. (Pool 은 CF 반영 전 값 — 원문 예시 9000+1000/10+250=9350)
 *  실력공식(Pool≈0 에서 V 아래로 꺾임)은 문서상 수식 미공개라 여기 자리만 예약(교체 훅). */
export function updateVBasic(v1: number, pool: number, gradient: number, cf: number): number {
  return v1 + (gradient > 0 ? pool / gradient : 0) + cf;
}

/** 밴드 [하단, 상단] = [V(1−b), V(1+b)]. */
export function bandOf(v: number, b: number): { low: number; high: number } {
  return { low: v * (1 - b), high: v * (1 + b) };
}

/** 평가금(qty×price)을 밴드로 되돌리는 매매 수량(양수=매수·음수=매도·0=무행동).
 *  - 평가금 < low → 매수해 평가금을 하단까지(정수 주). 매수는 buyBudget(사이클 한도 잔량)·pool 로 제한.
 *  - 평가금 > high → 매도해 평가금을 상단까지(제한 없음 — 매도는 항상 허용).
 *  fee 는 매수여력 판정에만 반영(price×(1+fee)). 실제 대금/대차는 호출측이 처리. */
export function rebalanceShares(args: {
  qty: number; price: number; low: number; high: number; buyBudget: number; pool: number; fee: number;
}): number {
  const { qty, price, low, high, buyBudget, pool, fee } = args;
  if (price <= 0) return 0;
  const val = qty * price;
  if (val < low) {
    const wantUp = Math.floor((low - val) / price); // 하단까지 필요한 주수
    const byBudget = Math.floor(buyBudget / (price * (1 + fee)));
    const byPool = Math.floor(pool / (price * (1 + fee)));
    return Math.max(0, Math.min(wantUp, byBudget, byPool));
  }
  if (val > high) {
    const wantDown = Math.floor((val - high) / price); // 상단까지 팔 주수
    return -Math.min(wantDown, qty);
  }
  return 0;
}

/** VR 장부 상태 — 백테스트·라이브 공용. qty/pool 은 장부(라이브는 대사로 broker 와 동기화),
 *  V=목표경로값, buyBudget=사이클 매수한도 잔량, sinceCycle=사이클-일 카운터, cum*=실효평단 리포팅. */
export interface VRState {
  qty: number;
  pool: number;
  V: number;
  buyBudget: number;
  sinceCycle: number;
  cumBuy: number;
  cumSell: number;
}

/** 초기 진입: principal 을 주식:Pool(기본 85:15)로 분할. 첫 V = 매수 직후 평가금(qty×price). */
export function seedVR(cfg: ValueRebalancingConfig, price0: number): VRState {
  const fee = cfg.feeRate && cfg.feeRate > 0 ? cfg.feeRate : 0;
  const initStock = cfg.initStockRatio ?? 0.85;
  const qty = Math.floor((cfg.principal * initStock) / (price0 * (1 + fee)));
  const cumBuy = qty * price0 * (1 + fee);
  const pool = cfg.principal - cumBuy;
  return { qty, pool, V: qty * price0, buyBudget: cfg.poolLimitPct * pool, sinceCycle: 0, cumBuy, cumSell: 0 };
}

/** 인출(CF<0)이 Pool 로 부족하면 주식 매도로 충당할 주수(Pool≥0 불변식). 충당 불필요/불가면 0.
 *  사이클 경계에서 advanceCycleVR 이전에 호출 — 반환 주수를 applyVRFill(매도)로 반영해야 한다. */
export function cycleCoverSellQty(state: VRState, cfg: ValueRebalancingConfig, price: number): number {
  const cf = cfg.cashflow ?? 0;
  const fee = cfg.feeRate && cfg.feeRate > 0 ? cfg.feeRate : 0;
  if (cf < 0 && state.pool + cf < 0 && price > 0) {
    return Math.min(state.qty, Math.ceil(-(state.pool + cf) / (price * (1 - fee))));
  }
  return 0;
}

/** 사이클 경계: V 갱신(V₂=V₁+Pool/G+CF, Pool 은 CF 반영 전) + CF 적용 + 매수예산 리셋 + sinceCycle=0.
 *  cover-sell(인출충당)은 이 호출 전에 applyVRFill 로 pool/qty 에 이미 반영돼 있어야 한다. */
export function advanceCycleVR(state: VRState, cfg: ValueRebalancingConfig): VRState {
  const cf = cfg.cashflow ?? 0;
  const V = updateVBasic(state.V, state.pool, cfg.gradient, cf); // Pool 은 CF 반영 전 값(원문 예시)
  const pool = cf !== 0 ? Math.max(0, state.pool + cf) : state.pool;
  return { ...state, V, pool, buyBudget: cfg.poolLimitPct * pool, sinceCycle: 0 };
}

/** 체결 1건을 Pool 장부에 반영(매수→pool·buyBudget↓·qty↑ / 매도→pool↑·qty↓). fee 는 대금에 반영. */
export function applyVRFill(
  state: VRState, fill: { side: "buy" | "sell"; qty: number; price: number }, fee: number,
): VRState {
  if (fill.side === "buy") {
    const cost = fill.qty * fill.price * (1 + fee);
    return { ...state, pool: state.pool - cost, cumBuy: state.cumBuy + cost, buyBudget: state.buyBudget - cost, qty: state.qty + fill.qty };
  }
  const proceeds = fill.qty * fill.price * (1 - fee);
  return { ...state, pool: state.pool + proceeds, cumSell: state.cumSell + proceeds, qty: state.qty - fill.qty };
}

/** VR 백테스트. target=대상 ETF(단일). 매매 구간은 from/to. 순수 함수(seedVR/advanceCycleVR/
 *  applyVRFill/rebalanceShares)를 라이브 엔진과 공유한다 — 로직 단일 소스. */
export function runValueRebalancingBacktest(target: RotationCandidate, cfg: ValueRebalancingConfig): BacktestResult {
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const poolLog: string[] = [];
  // 차트용 — 그날 판정에 쓴 밴드와, 밴드가 실제로 감싸는 주식 평가금 (#341).
  const vrBand: { date: string; v: number; low: number; high: number; stock: number }[] = [];
  const contributions: { date: string; amount: number }[] = [];
  const fee = cfg.feeRate && cfg.feeRate > 0 ? cfg.feeRate : 0;
  const b = cfg.bandPct;
  const cycleDays = Math.max(1, Math.floor(cfg.cycleDays));
  const cf = cfg.cashflow ?? 0;
  const tk = target.ticker;

  const bars = target.bars.filter((bar) => (!cfg.from || bar.date >= cfg.from) && (!cfg.to || bar.date <= cfg.to) && bar.close > 0);
  if (bars.length === 0) return { trades, equityCurve, totalPnl: 0, vrBand };

  const p0 = bars[0].close;
  let state = seedVR(cfg, p0);
  if (state.qty >= 1) trades.push({ date: bars[0].date, side: "buy", price: p0, qty: state.qty, pnl: 0, roundNo: 0, ticker: tk });
  let band = bandOf(state.V, b);

  // 체결 기록 + 장부 반영(백테스트는 종가 즉시 체결)
  const fill = (date: string, side: "buy" | "sell", price: number, n: number) => {
    trades.push({ date, side, price, qty: n, pnl: 0, roundNo: 0, ticker: tk });
    state = applyVRFill(state, { side, qty: n, price }, fee);
  };

  for (let i = 0; i < bars.length; i++) {
    const date = bars[i].date;
    const price = bars[i].close;

    // 사이클 경계(첫 바 제외): 인출충당 매도 → V 갱신 + CF + 밴드/예산 리셋
    if (i > 0 && state.sinceCycle >= cycleDays) {
      const coverQ = cycleCoverSellQty(state, cfg, price);
      if (coverQ > 0) fill(date, "sell", price, coverQ);
      state = advanceCycleVR(state, cfg);
      if (cf !== 0) contributions.push({ date, amount: cf });
      // 존버모드 감지: Pool 이 1주도 못 살 만큼 소진 → V 정체(기본공식 한계)
      if (state.pool < price) poolLog.push(`${date} 존버모드 경보: Pool 소진(${state.pool.toFixed(0)}) — 기본공식 V 정체`);
      band = bandOf(state.V, b);
    }

    // 매일 밴드 판정 매매
    const delta = rebalanceShares({ qty: state.qty, price, low: band.low, high: band.high, buyBudget: state.buyBudget, pool: state.pool, fee });
    if (delta > 0) fill(date, "buy", price, delta);
    else if (delta < 0) fill(date, "sell", price, -delta);

    equityCurve.push({ date, equity: state.qty * price + state.pool });
    // 판정에 쓴 그 밴드를 그대로 남긴다 — 화면이 다시 계산하면 둘이 어긋날 수 있다.
    vrBand.push({ date, v: state.V, low: band.low, high: band.high, stock: state.qty * price });
    state = { ...state, sinceCycle: state.sinceCycle + 1 };
  }

  const invested = cf !== 0 ? cfg.principal + contributions.reduce((s, c) => s + c.amount, 0) : cfg.principal;
  const totalPnl = equityCurve.length ? equityCurve[equityCurve.length - 1].equity - invested : 0;
  return {
    trades, equityCurve, totalPnl, vrBand,
    ...(poolLog.length ? { poolLog } : {}),
    ...(cf !== 0 ? { contributions, totalContributed: invested } : {}),
  };
}

// 무한매수법 V4.0 백테스트 — **백테스트=실거래 단일코드**.
// 하루 주문 계획은 lib/trading/v4-plan.ts 의 v4PlanDay()(실거래 엔진과 같은 함수)가 만들고,
// 여기서는 그 주문을 LOC 체결 규칙으로 채점만 한다(종가를 모르고 주문하는 실전과 동일):
//   매수 LOC: 종가≤지정가 → 종가 체결 / 매도 LOC: 종가≥지정가 → 종가 체결 /
//   매도 지정가: 고가≥지정가 → 지정가 체결 / MOC: 종가 체결.
// T·모드 전이 규칙은 파이썬 strategy/infinite_v4.InfiniteV4Simulator 와 대칭.

import { BIG_BUY_PCT, v4PlanDay } from "@/lib/trading/v4-plan";
import type { BacktestResult, Bar, BtTrade, EquityPoint } from "./types";

export interface InfiniteV4Config {
  principal: number;
  splits: number; // 20/30/40 (원문 추천). 별%·T 감쇠율이 분할수에 연동된다.
  // V(변동성 계수, %) — 포스트 Tier-0 원자 팩터. 종목별 고유값(TQQQ 15 / SOXL 20 / KODEX레버리지 8).
  // 별% base·최종매도 목표(+V%)·리버스 탈출선(−V%)을 전부 구동한다. 미지정/0 이면 §5.3.2 로 자동 유도.
  v?: number;
}

/** 포스트 §5.3.2 — 일간 로그수익률 표준편차 σ 로 변동성 계수 V 를 유도한다.
 *  V ≈ 4 × σ(%)  (TQQQ σ≈3.7%→15, SOXL σ≈5.0%→20). 표본 부족·σ=0 시 15(TQQQ) 폴백.
 *  주의: 포스트는 σ 를 "최근 1년·분기 재계산" 하지만, 백테스트는 로드된 전체 구간 σ 로 V 를 1회
 *  산출한다(V±1 엔 둔감한 코스 팩터 — 롤링 재계산은 범위 밖, 소폭 lookahead). ⚠ σ→V 유도 자체는
 *  포스트가 밝힌 미검증 추론(§5.5). */
export function deriveVFromBars(bars: Bar[]): number {
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const p0 = bars[i - 1].close;
    const p1 = bars[i].close;
    if (p0 > 0 && p1 > 0) rets.push(Math.log(p1 / p0));
  }
  if (rets.length < 2) return 15;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  const sigmaPct = Math.sqrt(variance) * 100;
  const v = Math.round(4 * sigmaPct);
  return v > 0 ? v : 15;
}

/** 리버스모드 매도 시 T 감쇠 배수 = 1 − 1/(등분수), 등분수 = splits/2 (포스트 §6.1.1 유도).
 *  40분할→0.95, 20분할→0.90, 30분할→0.9333. (기존 삼항 splits===20?0.9:0.95 는 30분할 오채점.) */
export function revSellDecay(splits: number): number {
  return 1 - 1 / (splits / 2);
}

export function runInfiniteV4Backtest(bars: Bar[], cfg: InfiniteV4Config): BacktestResult {
  const { principal, splits } = cfg;
  const V = cfg.v && cfg.v > 0 ? cfg.v : deriveVFromBars(bars); // 미지정/0 → §5.3.2 자동 유도
  const planCfg = { splits, starBase: V, sellTarget: V / 100 }; // V 하나가 별%·최종매도를 구동
  const REV_SELL_DECAY = revSellDecay(splits);
  const RECOVER_PCT = V / 100; // 리버스 탈출선 −V%

  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let qty = 0;
  let avg = 0;
  let T = 0;
  let cash = principal; // 잔금(복리 — 사이클 종료 후에도 유지)
  let mode: "normal" | "reverse" = "normal";
  let reverseFirstDay = false;
  let recoverConfirmed = false;
  let entryLimit: number | null = null;
  const closes: number[] = [];

  const push = (side: "buy" | "sell", bar: Bar, q: number, price: number, pnl = 0) =>
    trades.push({ date: bar.date, side, price, qty: q, pnl, roundNo: Math.round(T * 100) / 100 });

  const buyFill = (q: number, price: number) => {
    const cost = price * q;
    avg = qty + q > 0 ? (avg * qty + cost) / (qty + q) : price;
    qty += q;
    cash -= cost;
    return cost;
  };

  for (const bar of bars) {
    const prev5 = closes.slice(-5);
    const ref = closes.length ? closes[closes.length - 1] : bar.close; // 참조가 = 전일종가
    closes.push(bar.close);

    if (mode === "reverse" && recoverConfirmed) {
      mode = "normal";
      recoverConfirmed = false;
    }

    const wasEntry = qty === 0 && mode === "normal";
    if (wasEntry && entryLimit === null) {
      // 새 사이클 첫날: 오늘은 계획만(내일 전일종가+10% LOC)
      entryLimit = bar.close * (1 + BIG_BUY_PCT);
      equityCurve.push({ date: bar.date, equity: 0 });
      continue;
    }

    const plan = v4PlanDay({
      mode, t: T, avg, holding: qty, cash, refPrice: ref,
      entryLimit, prev5, reverseFirstDay, cfg: planCfg,
    });

    const one = cash / Math.max(0.5, splits - T);
    const entryShot = cash / splits;
    let soldQ75 = false;
    let soldQ25 = false;
    let bought = 0;
    let revSold = false;
    let revBought = false;

    // 매도 먼저(현행 규칙 순서), 그다음 매수 — 각 주문을 체결모델로 채점
    for (const o of [...plan].sort((a, b) => (a.side === "sell" ? 0 : 1) - (b.side === "sell" ? 0 : 1))) {
      if (o.side === "sell") {
        if (o.kind === "market") {
          push("sell", bar, o.qty, bar.close, (bar.close - avg) * o.qty);
          qty -= o.qty;
          cash += bar.close * o.qty;
          revSold = true;
        } else if (o.kind === "limit" && bar.high >= o.price) {
          push("sell", bar, o.qty, o.price, (o.price - avg) * o.qty);
          qty -= o.qty;
          cash += o.price * o.qty;
          soldQ75 = true;
        } else if (o.kind === "loc" && bar.close >= o.price) {
          push("sell", bar, o.qty, bar.close, (bar.close - avg) * o.qty);
          qty -= o.qty;
          cash += bar.close * o.qty;
          if (o.tag === "q25") soldQ25 = true;
          else revSold = true;
        }
      } else if (bar.close <= o.price) { // 매수 LOC: 종가≤지정가 → 종가 체결
        bought += buyFill(o.qty, bar.close);
        push("buy", bar, o.qty, bar.close);
        if (o.tag === "rev_qbuy") revBought = true;
      }
    }

    // 상태 전이
    if (mode === "normal") {
      if (wasEntry) {
        if (bought > 0) {
          T = bought / entryShot;
          entryLimit = null;
        } else {
          entryLimit = bar.close * (1 + BIG_BUY_PCT); // 미체결 → 기준 갱신
        }
      } else if (qty === 0) {
        avg = 0;
        T = 0;
        entryLimit = null; // 사이클 종료(복리)
      } else {
        if (soldQ75) T *= 0.25;
        else if (soldQ25) T *= 0.75;
        if (bought > 0) T += bought / one;
        if (T > splits - 1) {
          mode = "reverse";
          reverseFirstDay = true;
        }
      }
    } else {
      if (reverseFirstDay) {
        if (revSold) T *= REV_SELL_DECAY;
        reverseFirstDay = false;
      } else {
        if (revSold) T *= REV_SELL_DECAY;
        if (revBought) T += (splits - T) * 0.25;
      }
      if (qty === 0) {
        avg = 0;
        T = 0;
        mode = "normal";
        entryLimit = null;
      } else if (bar.close > avg * (1 - RECOVER_PCT)) {
        recoverConfirmed = true; // 회복 확인 → 다음날부터 일반모드(T 연결)
      }
    }

    equityCurve.push({ date: bar.date, equity: qty * bar.close });
  }

  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return { trades, equityCurve, totalPnl, resolvedV: V };
}

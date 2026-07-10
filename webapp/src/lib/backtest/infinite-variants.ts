// 무한매수법 버전별(v2.1 / v2.2 / v3.0) 백테스트 — 웹 공개 정리본 기반 구현.
// (v4.0 은 공식 원문 PDF 대조본을 infinite-v4.ts 에 별도 구현 — 리버스모드 포함)
//
// 출처(규칙 정리):
//   - v1/v2/v2.1: truedonshow.com "무한매수법 v1, v2, v2.1 원큐정리"
//   - v2.2(2023 오피셜)/v3.0: quantstack.app/infinite/{v2-2,v3-0}
//
// 공통 골격: 원금을 splits 분할, 매일 1회분을 LOC 로 매수(전반전은 절반씩 두 지정가,
// 후반전은 전체를 보수적으로), 보유분은 25%/75% 로 나눠 매도(25% 는 별% LOC "쿼터매도",
// 75% 는 +목표% 지정가). 별% = base − (2×base/splits)×T (T=진행회차; T=splits/2 에서 0).
//
//   버전   base   기본분할  75%매도   전반전 매수(절반씩)        후반전 매수(전체)
//   v2.1   +5고정   40      +10%     평단 LOC + 평단+5% LOC     평단 LOC
//   v2.2   10       40      +10%     평단 LOC + 별% LOC         별% LOC
//   v3.0   15       20      +15%     별% LOC + 평단 LOC         별% LOC
//
// 버전별 차이 구현:
//   - v2.1 매도: 전반 [25% +5% LOC / 75% +10% 지정가], 후반 [25% +0% LOC / 25% +5% 지정가 / 50% +10% 지정가]
//   - T = 매수누적액 / 1회매수액
//
// 단순화(미구현 — 결과 해석 시 참고):
//   - RSI 진입 타이밍(v2+), 쿼터손절/쿼터모드(v2.2 의 39<T≤40, v3.0 의 19<T<20), 수익 복리
//     재투자 리셋(v3.0)은 생략. 첫 매수는 1회분 종가 진입.
//   - splits 소진(T≥splits) 후엔 매수 중단·매도 대기(v1 과 동일)만 한다.
//
// 체결 모델(LOC 의 본질 = 종가 단일가 체결 — v1 엔진의 저가터치 근사보다 보수적):
//   - LOC 매수(P): 종가 ≤ P → 종가 체결 / LOC 매도(P): 종가 ≥ P → 종가 체결
//   - 지정가 매도(P): 고가 ≥ P → P 체결 / 진입(시장가): 종가 체결

import type { BacktestResult, Bar, BtTrade, EquityPoint } from "./types";

export type InfiniteVariantVersion = "v2_1" | "v2_2" | "v3_0";

export interface InfiniteVariantConfig {
  principal: number;
  splits: number; // 분할 수(기본 v2.1/v2.2=40, v3.0=20)
  version: InfiniteVariantVersion;
}

/** 버전별 상수 — base(별% 시작값), 75% 매도 목표. v4.0 은 공식 원문 기반 별도 엔진(infinite-v4.ts). */
const VER = {
  v2_1: { starBase: 0, sellTarget: 0.10 }, // v2.1 은 별% 대신 +5% 고정 큰수
  v2_2: { starBase: 10, sellTarget: 0.10 },
  v3_0: { starBase: 15, sellTarget: 0.15 },
} as const;

interface Order {
  side: "buy" | "sell";
  kind: "loc" | "limit" | "market";
  price: number;
  qty: number;
}

export function runInfiniteVariantBacktest(bars: Bar[], cfg: InfiniteVariantConfig): BacktestResult {
  const { principal, splits, version } = cfg;
  const { starBase, sellTarget } = VER[version];
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];

  let qty = 0;
  let avg = 0;
  let T = 0; // 진행 회차(매수누적액/1회액; v4 는 이벤트 기반 + 쿼터매도 ×0.75)
  const starPct = (t: number) => (starBase - (2 * starBase * t) / splits) / 100;

  const oneShot = () => principal / splits;

  for (const bar of bars) {
    const orders: Order[] = [];
    const half = splits / 2;

    if (qty === 0) {
      // 진입: 1회분 종가 매수(단순화). 다음 바부터 본 규칙.
      const one = oneShot();
      const q = Math.floor(one / bar.close);
      if (q >= 1) orders.push({ side: "buy", kind: "market", price: bar.close, qty: q });
    } else {
      const star = starPct(T);
      // ── 매도 주문(보유 시 항상) ──
      const q25 = Math.floor(qty / 4);
      const rest = qty - q25;
      if (version === "v2_1") {
        if (T < half) {
          if (q25 >= 1) orders.push({ side: "sell", kind: "loc", price: avg * 1.05, qty: q25 });
          if (rest >= 1) orders.push({ side: "sell", kind: "limit", price: avg * 1.10, qty: rest });
        } else {
          const q25b = Math.floor(qty / 4);
          const q50 = qty - q25 - q25b;
          if (q25 >= 1) orders.push({ side: "sell", kind: "loc", price: avg, qty: q25 });
          if (q25b >= 1) orders.push({ side: "sell", kind: "limit", price: avg * 1.05, qty: q25b });
          if (q50 >= 1) orders.push({ side: "sell", kind: "limit", price: avg * 1.10, qty: q50 });
        }
      } else {
        // v2.2/v3.0/v4.0 공통: 25% 별% LOC(쿼터매도) + 75% 목표% 지정가
        if (q25 >= 1) orders.push({ side: "sell", kind: "loc", price: avg * (1 + star), qty: q25 });
        if (rest >= 1) orders.push({ side: "sell", kind: "limit", price: avg * (1 + sellTarget), qty: rest });
      }
      // ── 매수 주문(원금 소진 전) ──
      if (T < splits) {
        const one = oneShot();
        const h = one / 2;
        const pushBuy = (price: number, amt: number) => {
          const q = Math.floor(amt / price);
          if (q >= 1) orders.push({ side: "buy", kind: "loc", price, qty: q });
        };
        if (version === "v2_1") {
          if (T < half) {
            pushBuy(avg, h);
            pushBuy(avg * 1.05, h);
          } else {
            pushBuy(avg, one); // 후반전: 평단 이하만 전량
          }
        } else if (T < half) {
          pushBuy(avg, h);
          pushBuy(avg * (1 + star), h);
        } else {
          pushBuy(avg * (1 + star), one); // 후반전: 별%(음수 → 평단 아래) 전량
        }
      }
    }

    // ── 체결 ──
    const one = oneShot(); // T 증가 계산용(체결 전 시점 1회액)
    for (const o of orders) {
      let filled: number | null = null;
      if (o.kind === "market") filled = bar.close;
      else if (o.kind === "loc") filled = o.side === "buy" ? (bar.close <= o.price ? bar.close : null) : bar.close >= o.price ? bar.close : null;
      else filled = bar.high >= o.price ? o.price : null; // limit sell
      if (filled === null) continue;

      if (o.side === "buy") {
        const cost = filled * o.qty;
        avg = (avg * qty + cost) / (qty + o.qty);
        qty += o.qty;
        T += cost / one;
        trades.push({ date: bar.date, side: "buy", price: filled, qty: o.qty, pnl: 0, roundNo: Math.round(T * 10) / 10 });
      } else {
        const sellQ = Math.min(o.qty, qty);
        if (sellQ < 1) continue;
        const pnl = (filled - avg) * sellQ;
        qty -= sellQ;
        trades.push({ date: bar.date, side: "sell", price: filled, qty: sellQ, pnl, roundNo: Math.round(T * 10) / 10 });
        if (qty === 0) {
          avg = 0;
          T = 0;
        }
      }
    }
    equityCurve.push({ date: bar.date, equity: qty * bar.close });
  }

  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return { trades, equityCurve, totalPnl };
}

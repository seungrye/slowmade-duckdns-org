// 추세추종(이동평균 골든/데드크로스) — stock-automator-v2 strategy/trend_following.py 의
// generate() 포팅. 순수 함수. 원본 규칙:
//   - 골든크로스(어제 단기MA ≤ 장기MA, 오늘 단기MA > 장기MA) 발생일에 원금만큼 시장가 진입.
//   - 데드크로스(오늘 단기MA ≤ 장기MA)면 보유 전량 시장가 청산. 고정 손절 없음.
//   - 회차/분할/LOC 없음 — 추세 방향이 바뀔 때만 한 번 사고/판다.

import type { Signal, TrendConfig, TrendState } from "./types";

/** 최신순 종가 배열의 앞 period 개 평균. period 미만이면 null. */
export function sma(closesNewestFirst: number[], period: number): number | null {
  if (closesNewestFirst.length < period) return null;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closesNewestFirst[i];
  return sum / period;
}

export function generate(state: TrendState, cfg: TrendConfig): Signal[] {
  const cl = state.history; // 최신순 (오늘=cl[0])
  const s = cfg.shortMa;
  const lng = cfg.longMa;
  if (cl.length < lng + 1) return []; // 어제 MA 비교를 위해 +1

  const st = sma(cl, s);
  const lt = sma(cl, lng);
  const sy = sma(cl.slice(1), s); // 어제 기준
  const ly = sma(cl.slice(1), lng);
  if (st === null || lt === null || sy === null || ly === null) return [];

  const golden = st > lt;
  const goldenY = sy > ly;

  if (state.holdingQty === 0 && golden && !goldenY) {
    const qty = Math.floor(cfg.principal / state.price); // int(principal // price)
    if (qty >= 1) {
      return [{ side: "buy", qty, price: state.price, ordType: "market", reason: `골든크로스 진입(${s}MA>${lng}MA)` }];
    }
  } else if (state.holdingQty > 0 && !golden) {
    return [{ side: "sell", qty: state.holdingQty, price: state.price, ordType: "market", reason: `데드크로스 청산(${s}MA<=${lng}MA)` }];
  }
  return [];
}

// 추세추종(이동평균 골든/데드크로스) — stock-automator-v2 strategy/trend_following.py 의
// generate() 포팅. 순수 함수. 원본 규칙:
//   - 골든크로스(어제 단기MA ≤ 장기MA, 오늘 단기MA > 장기MA) 발생일에 원금만큼 시장가 진입.
//   - 데드크로스(오늘 단기MA ≤ 장기MA)면 보유 전량 시장가 청산. 고정 손절 없음.
//   - 회차/분할/LOC 없음 — 추세 방향이 바뀔 때만 한 번 사고/판다.

import { trendDecide } from "@/lib/trading/strategies";
import type { Signal, TrendConfig, TrendState } from "./types";

/** 최신순 종가 배열의 앞 period 개 평균. period 미만이면 null. */
export function sma(closesNewestFirst: number[], period: number): number | null {
  if (closesNewestFirst.length < period) return null;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closesNewestFirst[i];
  return sum / period;
}

// 백테스트도 실거래와 **동일한 결정 함수**(trendDecide, 라이브가 쓰는 그 함수)를 호출한다
// — 백테스트=실거래 단일코드. 여기선 시장가 체결모델(Signal 형태)로만 매핑.
export function generate(state: TrendState, cfg: TrendConfig): Signal[] {
  return trendDecide({
    symbol: "", closes: state.history, price: state.price, holdingQty: state.holdingQty,
    principal: cfg.principal, shortMa: cfg.shortMa, longMa: cfg.longMa,
  }).map((it) => ({ side: it.side, qty: it.qty, price: it.price,
                    ordType: "market" as const, reason: it.reason }));
}

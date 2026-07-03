// 무한매수법 백테스트 타입 — stock-automator-v2 의 strategy/base.py · backtest/engine.py 를
// 브라우저(TypeScript)로 포팅한 것. 전략 로직은 원본과 100% 동일하게 유지한다.

export type Side = "buy" | "sell";
export type OrdType = "market" | "limit" | "loc";

/** 일봉 한 개(OHLC). */
export interface Bar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
}

/** 무한매수법 설정(원본 StrategyConfig 의 백테스트 조정 파라미터). */
export interface InfiniteConfig {
  principal: number; // 배정 원금
  splits: number; // 분할 수 T (기본 40) — 하루 매수액 = principal/splits
  takeProfitPct: number; // 평단 대비 매도 목표 (기본 0.10)
  locPremiumPct: number; // LOC 매수 현재가 대비 상단 프리미엄 (기본 0.12)
}

/** 전략이 보는 시장 스냅샷(원본 MarketState 의 무한매수 사용분). */
export interface MarketState {
  price: number;
  holdingQty: number;
  avgPrice: number;
  roundNo: number;
}

export interface Signal {
  side: Side;
  qty: number;
  price: number;
  ordType: OrdType;
  reason: string;
}

export interface BtTrade {
  date: string;
  side: Side;
  price: number;
  qty: number;
  pnl: number; // 매수는 0, 매도는 실현손익
  roundNo: number; // 체결 시점 회차(매수는 체결 후, 매도는 사이클 리셋 직전)
}

export interface EquityPoint {
  date: string;
  equity: number; // 보유 평가액(원본 equity_curve 와 동일: 보유수량 × 종가)
}

export interface BacktestResult {
  trades: BtTrade[];
  equityCurve: EquityPoint[];
  totalPnl: number; // 매도 실현손익 합계
}

/** 추세추종 설정(원본 TrendConfig 의 백테스트 조정 파라미터). */
export interface TrendConfig {
  principal: number; // 진입 시 이 금액만큼 시장가 매수
  shortMa: number; // 단기 이동평균 (기본 20)
  longMa: number; // 장기 이동평균 (기본 60)
}

/** 추세추종 전략이 보는 상태 — history 는 최신순 종가(오늘=history[0]). */
export interface TrendState {
  price: number;
  holdingQty: number;
  avgPrice: number;
  history: number[];
}

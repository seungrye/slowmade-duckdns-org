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
  ticker?: string; // 다중 종목 전략(rotation)에서 체결 종목 표시용
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

/** 추세추종 전략이 보는 상태 — history 는 최신순 종가(오늘=history[0]).
 *  peak 는 보유 중 최고 종가(엔진이 추적, 미보유면 0) — v4 트레일링 스탑 판정용. */
export interface TrendState {
  price: number;
  holdingQty: number;
  avgPrice: number;
  history: number[];
  peak?: number;
}

/** v2 — 가격/이동평균선 돌파. 종가가 MA 위로 돌파하면 매수, MA 아래로 내려오면 청산. */
export interface TrendV2Config {
  principal: number;
  maPeriod: number; // 기준 이동평균 (기본 20)
}

/** v3 — 추세(기울기) 필터 골든크로스. 장기MA 가 상승 중일 때만 골든크로스 진입. */
export interface TrendV3Config {
  principal: number;
  shortMa: number;
  longMa: number;
  slopeDays: number; // 장기MA 상승 판정: 오늘 장기MA > slopeDays 일 전 장기MA (기본 5)
}

/** v4 — 트레일링 스탑. 골든크로스 진입, 데드크로스 또는 보유 중 고점 대비 -trailPct 청산. */
export interface TrendV4Config {
  principal: number;
  shortMa: number;
  longMa: number;
  trailPct: number; // 고점 대비 하락 청산 비율 (기본 0.30 = 30%)
}

/** 레짐 모멘텀 v1 — 200일선 레짐 필터(밴드) + 절대 모멘텀 진입, 레짐 이탈/트레일링 청산.
 *  Faber 의 장기MA 타이밍 + Antonacci 절대 모멘텀 조합(하락장 현금 대피 + 상승장 보유). */
export interface RegimeV1Config {
  principal: number;
  smaPeriod: number; // 레짐 기준 장기 SMA (기본 200)
  bandPct: number; // SMA 밴드(히스테리시스) 비율 (기본 0.02 = ±2%) — 선 부근 왕복 매매 방지
  momDays: number; // 절대 모멘텀 확인 기간: 종가 ≥ momDays 일 전 종가 (기본 60)
  trailPct: number; // 보유 중 고점 대비 하락 청산 (기본 0.25)
}

/** 모멘텀 로테이션 v1 — 듀얼 모멘텀(Antonacci) × LRS 레짐 필터. 후보 ETF 중 최근
 *  momDays 수익률 1위만 보유(상대 모멘텀), 지수가 SMA−밴드 이탈이면 전량 현금(절대/레짐).
 *  종목 선택이 전략에 내장 — rebalanceDays 마다 1위를 재평가해 자동 교체한다. */
export interface RotationV1Config {
  principal: number;
  smaPeriod: number; // 시그널(1배 지수) SMA (기본 200)
  bandPct: number; // 레짐 밴드 히스테리시스 (기본 0.01)
  momDays: number; // 상대 모멘텀 룩백 거래일 (기본 126 ≈ 6개월)
  rebalanceDays: number; // 1위 재평가 주기 거래일 (기본 63 ≈ 분기 — 잦은 교체는 whipsaw 로 불리)
  from?: string; // 매매 구간(YYYY-MM-DD). 지표 워밍업은 구간 밖 데이터도 사용.
  to?: string;
}

/** 레버리지 로테이션 v1 (LRS, Gayed 2016) — **1배 지수를 시그널**로 3배 ETF 를 스위칭.
 *  시그널 종가 > 시그널 SMA(1+밴드)면 대상(레버리지 ETF) 보유, SMA(1-밴드) 이탈이면 현금.
 *  레버리지 ETF 자체 SMA 는 신호가 늦으므로(3배 변동) 지수 SMA 를 쓰는 것이 핵심. */
export interface LrsV1Config {
  principal: number;
  smaPeriod: number; // 시그널 SMA (기본 200)
  bandPct: number; // 밴드 히스테리시스 (기본 0.01 = ±1%)
  trailPct: number; // 보유 중 고점 대비 트레일링 스탑. 0 이면 미사용(기본)
}

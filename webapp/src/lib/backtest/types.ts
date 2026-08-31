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
  volume?: number; // 거래량 — rotation 후보 자동선발(거래대금 랭킹)에만 사용, 없으면 0 취급
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
  /**
   * 전략에 따라 뜻이 다르다 — 화면이 이름을 갈라 붙인다 (#345).
   *   무한매수·로테이션·듀얼모멘텀  매도 실현손익 합계
   *   VR·변동성타깃                최종자산 − 투입원금 (**평가손익 포함**)
   * 계속 들고 가는 전략은 실현손익만 보면 실제 성과를 못 나타내서 총손익을 쓴다.
   */
  totalPnl: number;
  resolvedV?: number; // 무한매수 v4: 실제 채점에 쓰인 V(변동성 계수). 사용자 입력값 또는 자동 유도값.
  poolLog?: string[]; // rotation 후보 자동선발 풀 변경 이력 (자동선발 모드에서만)
  /**
   * VR: 하루치 목표선·밴드·주식 평가금 (#341). 차트가 "왜 그날 사고팔았는지" 를 그린다.
   *
   * `stock` 을 따로 내는 이유: 밴드가 감싸는 것은 **주식 평가금**(qty × 종가)이지
   * `equityCurve.equity`(= 주식 + Pool 현금)가 아니다. 총자산에 밴드를 겹치면 Pool 만큼
   * 늘 위로 떠 "항상 밴드 밖" 처럼 보인다.
   */
  vrBand?: { date: string; v: number; low: number; high: number; stock: number }[];
  /**
   * VR 실효평단 = (누적매수 − 누적매도) / 보유수량 (원문 4.2). 보유가 0 이면 null.
   *
   * 명목평단(증권사 화면)은 매도해도 안 변하지만 이것은 변한다 — 수익 매도가 쌓이면
   * 내려가고, 끝내 **마이너스**가 되면 매수에 쓴 돈보다 매도로 번 돈이 크다는 뜻이다
   * (원문 4.3 "원금 ZERO 상태").
   */
  effectiveAvg?: number | null;
  // 적립식(주기 입금) — contribution 지정 시에만 채워진다. 지표(TWR)·총납입 표시용.
  contributions?: { date: string; amount: number }[]; // 실제 입금이 일어난 날짜·금액
  totalContributed?: number; // 초기 원금 + Σ 입금 (수익률 분모 왜곡 방지용 참고값)
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
  momLookbacks?: number[]; // 복합 모멘텀: 여러 룩백(예 [21,63,126,252]) 평균. 미지정이면 단일 momDays.
  rebalanceDays: number; // 1위 재평가 주기 거래일 (기본 63 ≈ 분기 — 잦은 교체는 whipsaw 로 불리)
  from?: string; // 매매 구간(YYYY-MM-DD). 지표 워밍업은 구간 밖 데이터도 사용.
  to?: string;
  // 후보 자동선발(rotation-pool.ts) — 지정 시 candidates 는 시드 전체 데이터를 담고,
  // 풀 미확정·현금 대기·재평가 도래 시점에 거래대금 상위 poolSize 종으로 풀을 재선발한다.
  autoSeed?: { ticker: string; group: string }[];
  poolSize?: number; // 기본 4
  liqDays?: number; // 거래대금 평균 기간(기본 20)
  // 분할매수(DCA): 진입/교체 시 현금 전액을 한 번에 사는 대신 dcaSlices 거래일에 걸쳐
  // sliceCash=cash/dcaSlices 씩 나눠 매수(평단 누적). 미지정/≤1 이면 기존 일시금 매수.
  dcaSlices?: number;
  // 거래비용(편도 수수료+슬리피지 비율, 예: 0.0025=0.25%). 매수는 q=floor(cash/(price·(1+fee)))
  // 로 축소(라이브 buyableQty 와 동일 원리), 매도대금은 (1−fee) 반영. 미지정/0 이면 무비용(기존).
  feeRate?: number;
  // 적립식(적립 투자) — 매월(거래월 경계) contribution 만큼 현금 유입. 보유·레짐온이면 당일 종가로
  // 즉시 추가매수(현금 드래그 제거), 레짐오프/미보유면 현금 대기 후 다음 진입에 투입. 미지정/0 이면 목돈 단일 투입(기존).
  contribution?: number;
}

/** 듀얼 모멘텀(GEM, Antonacci) — 후보 중 상대모멘텀 1위 보유 + 절대모멘텀(1위 ≤ 방어자산)이면
 *  방어자산(예 IEF 채권) 대피. 재평가주기마다 판정, 전량 in/out(1종목), 복리. SMA 레짐 없음. */
export interface DualMomentumV1Config {
  principal: number;
  momDays: number; // 모멘텀 룩백 거래일 (기본 252 ≈ 12개월)
  momLookbacks?: number[]; // 복합 모멘텀(여러 룩백 평균). 미지정이면 단일 momDays.
  rebalanceDays: number; // 재평가 주기 거래일 (기본 21 ≈ 월 1회)
  from?: string;
  to?: string;
  feeRate?: number; // 편도 거래비용
  contribution?: number; // 적립식: 매월 유입액. 항상 투자 상태이므로 보유 자산에 즉시 증액. 미지정/0=목돈(기존).
}

/** 변동성 타깃 레버리지 — 레버리지 ETF 를 목표 변동성에 맞춰 부분 포지션으로 노출 조절.
 *  노출 f = min(maxLeverage, targetVol / 실현변동성). 시그널 지정 시 SMA 이탈이면 f=0(현금). */
export interface VolTargetV1Config {
  principal: number;
  targetVolPct: number; // 목표 연변동성 % (예 25)
  volLookback: number; // 실현변동성 계산 창(거래일, 기본 20)
  maxLeverage: number; // 최대 노출 배수(기본 1.0 = 현금 이내)
  rebalanceBand: number; // 노출 드리프트 이 이상일 때만 재조정(기본 0.05 = 5%p). 거래 절감.
  smaPeriod?: number; // 시그널 SMA (지정 시 레짐 필터)
  bandPct?: number;
  from?: string;
  to?: string;
  feeRate?: number;
  contribution?: number; // 적립식: 매월 유입액. equity 증가→목표노출(f×equity) 확대로 f 비율만 투입, (1−f)는 완충 유지. 미지정/0=목돈(기존).
}

/** 라오어 밸류리밸런싱(VR) — 단일 레버리지 ETF를 목표 경로 V의 밴드(±b) 안으로 유지하는 밸류애버리징 발전형.
 *  계좌 = 주식(평가금) + Pool(현금). 사이클(2주)마다 V₂=V₁+Pool/G+CF, 밴드 재계산. 매일 밴드 이탈 시
 *  밴드 경계까지 리밸런스(하단 아래→매수, 상단 위→매도). 평단 무관(가격만 사용). 적립/거치/인출 지원. */
export interface ValueRebalancingConfig {
  principal: number; // 초기 총자금(주식 + Pool)
  /** G — 위험 다이얼. **안 적으면 운용 형태에서 유도**(적립·거치 10 / 인출 20, 원문 7.1). 클수록 보수적 */
  gradient?: number;
  bandPct: number; // 밴드폭 b (기본 0.15 = ±15%) — 매매 빈도 조절(저민감)
  /**
   * 사이클당 Pool 매수 사용 한도 u. **안 적으면 운용 형태에서 유도**(적립 0.75 / 거치 0.50 /
   * 인출 0.25, 원문 3장). 원문이 "가이드일 뿐이며 선택 가능" 이라 해서 덮어쓸 수 있게 둔다.
   *
   * ⚠ 원문은 "적립**후** pool 의 75%" — 한도는 CF **반영 후** pool 기준이다(V 는 CF 전 pool).
   */
  poolLimitPct?: number;
  cycleDays: number; // 사이클 길이(거래일, 기본 10 = 2주)
  initStockRatio?: number; // 초기 주식:Pool 비율(기본 0.85 = 85:15). 원문 미규정 — 평형 현금비중 근사
  cashflow?: number; // 사이클당 현금흐름 CF: 양수=적립, 음수=인출, 0/미지정=거치
  feeRate?: number; // 편도 수수료+슬리피지
  from?: string;
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

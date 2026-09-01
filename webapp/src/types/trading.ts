/**
 * 실매매 전략 목록 — **여기가 단일 출처다** (#354).
 *
 * 예전엔 이 목록이 모델 enum·API 검증 배열·에러 메시지·UI 맵 세 벌에 각각 문자열로 적혀
 * 있었다. #352 에서 엔딩 목록이 똑같은 구조로 어긋나 완주 기록이 2주 넘게 통째로 버려졌다.
 * 타입은 런타임 문자열 배열을 못 보므로 어긋나도 컴파일이 통과한다 — 그래서 배열을 원본으로
 * 두고 타입을 파생한다.
 *
 * 전략을 더할 때: 이 배열과 아래 라벨에 한 줄씩. 그러면
 *   - `Record<LiveStrategyId, …>` 로 선언한 UI 맵들은 빠진 항목이 **컴파일 에러**로,
 *   - 타입이 못 보는 mongoose enum 은 `lib/trading/live-strategies.test.ts` 로
 * 빠짐없이 걸린다. 엔진 연결(engines.ts)은 별개이므로 그건 따로 확인할 것.
 *
 * ── 백테스트 전략과 왜 안 합치나 ────────────────────────────────────────
 *
 * `admin/backtest/backtest-client.tsx` 에는 전략이 13종 있다(dual_momentum_v1·vol_target_v1·
 * regime_v1·trend_v2/v3/v4·infinite_v2_2 …). **일부러 다른 집합이다** — 과거 데이터로만
 * 돌려 보는 것과 실제로 주문을 내는 것은 다르다. 닮았다고 합치면 실매매 설정에서 엔진도 없는
 * 전략을 고를 수 있게 되고, 고르는 순간 터진다. 중복처럼 보여도 합치지 말 것.
 */
export const LIVE_STRATEGY_IDS = [
  "lrs_v1",
  "rotation_v1",
  "trend_v1",
  "infinite_v4",
  "value_rebalancing",
] as const;

export type LiveStrategyId = (typeof LIVE_STRATEGY_IDS)[number];

/** 설정 화면의 전략 선택지에 쓰는 이름. */
export const LIVE_STRATEGY_LABEL: Record<LiveStrategyId, string> = {
  lrs_v1: "LRS",
  rotation_v1: "모멘텀 로테이션",
  trend_v1: "추세추종",
  infinite_v4: "무한매수 V4",
  value_rebalancing: "밸류리밸런싱 VR",
};

/** 저장된 문자열이 실매매 전략인지. API 검증·좁히기 양쪽에 쓴다. */
export function isLiveStrategy(v: unknown): v is LiveStrategyId {
  return typeof v === "string" && (LIVE_STRATEGY_IDS as readonly string[]).includes(v);
}

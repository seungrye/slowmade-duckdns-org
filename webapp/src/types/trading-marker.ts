/**
 * 매매 차트의 전략별 마커 (#367).
 *
 * 예전엔 화면(`admin/stocks/multi-chart-client.tsx`)이 전략 두 개를 직접 비교하고 있었다.
 *
 *   s === "infinite_v1" ? "triangle" : s === "trend_v1" ? "diamond" : "circle"
 *
 * 그래서 실제 기록의 `infinite_v4` 145건·`rotation_v1` 4건이 **전부 "기타 ○"** 로 그려졌다.
 * 미국 계좌에 블록이 둘(TQQQ v4 · SOXL VR)이 되면서 이게 실제로 문제가 됐다 — 둘 다
 * "기타"라 차트에서 구분이 안 된다.
 *
 * 목록은 `LIVE_STRATEGY_IDS` 가 원본이고 아래 표는 `Record<LiveStrategyId, …>` 라,
 * **전략을 더하면 컴파일이 깨져** 여기를 빠뜨릴 수 없다 (#354 와 같은 방식).
 */
import { LIVE_STRATEGY_LABEL, isLiveStrategy, type LiveStrategyId } from "./trading";

/** ECharts scatter symbol. 서로 겹치면 구분이 안 되므로 전부 다른 모양이다. */
export const LIVE_STRATEGY_MARKER: Record<LiveStrategyId, string> = {
  infinite_v4: "triangle",
  value_rebalancing: "diamond",
  trend_v1: "rect",
  rotation_v1: "roundRect",
  lrs_v1: "pin",
};

/** 저장된 전략 문자열 → 마커 모양. 지금 안 도는 옛 전략은 동그라미로 떨어진다. */
export function strategyMarker(s?: string): string {
  return isLiveStrategy(s) ? LIVE_STRATEGY_MARKER[s] : "circle";
}

/** 저장된 전략 문자열 → 화면 이름. 지금 안 도는 옛 전략은 "기타". */
export function strategyLabel(s?: string): string {
  return isLiveStrategy(s) ? LIVE_STRATEGY_LABEL[s] : "기타";
}

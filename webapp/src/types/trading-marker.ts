/**
 * The trade chart's per-strategy markers (#367).
 *
 * The screen (`admin/stocks/multi-chart-client.tsx`) used to compare two strategies directly.
 *
 *   s === "infinite_v1" ? "triangle" : s === "trend_v1" ? "diamond" : "circle"
 *
 * So the real records' 145 `infinite_v4` and 4 `rotation_v1` entries were **all drawn as "other"**.
 * It became a real problem once the US account had two blocks (TQQQ v4 and SOXL VR) - both were
 * "other" and could not be told apart on the chart.
 *
 * `LIVE_STRATEGY_IDS` is the list's source and the table below is a `Record<LiveStrategyId, …>`, so
 * **adding a strategy breaks the compile** and this cannot be forgotten (the same approach as #354).
 */
import { LIVE_STRATEGY_LABEL, isLiveStrategy, type LiveStrategyId } from "./trading";

/** The ECharts scatter symbol. Overlapping ones would be indistinguishable, so every shape differs. */
export const LIVE_STRATEGY_MARKER: Record<LiveStrategyId, string> = {
  infinite_v4: "triangle",
  value_rebalancing: "diamond",
  trend_v1: "rect",
  rotation_v1: "roundRect",
  lrs_v1: "pin",
};

/** A stored strategy string -> the marker's shape. An old strategy no longer running falls through to a circle. */
export function strategyMarker(s?: string): string {
  return isLiveStrategy(s) ? LIVE_STRATEGY_MARKER[s] : "circle";
}

/** A stored strategy string -> the display name. An old strategy no longer running is "other". */
export function strategyLabel(s?: string): string {
  return isLiveStrategy(s) ? LIVE_STRATEGY_LABEL[s] : "기타";
}

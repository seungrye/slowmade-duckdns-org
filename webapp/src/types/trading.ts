/**
 * The live trading strategy list - **this is the single source** (#354).
 *
 * This list used to be written out as strings in three separate places: the model's enum, the API's validation array,
 * the error messages and the UI maps. In #352 the ending list drifted the same way and over two weeks of completed runs were discarded.
 * A type cannot see a runtime string array, so a drift still compiles - hence the array is the source
 * and the type is derived from it.
 *
 * To add a strategy: one line in this array and one in the labels below. Then
 *   - the UI maps declared as `Record<LiveStrategyId, …>` catch a missing entry as **a compile error**, and
 *   - the mongoose enum, which the types cannot see, is caught by `lib/trading/live-strategies.test.ts`.
 * Wiring the engine (engines.ts) is separate, so check that yourself.
 *
 * -- Why it is not merged with the backtest strategies -------------------
 *
 * `admin/backtest/backtest-client.tsx` has 13 strategies (dual_momentum_v1, vol_target_v1,
 * regime_v1, trend_v2/v3/v4, infinite_v2_2 …). **They are a deliberately different set** - running something over past
 * data and actually placing orders are not the same. Merging them because they look alike would let the live settings pick a
 * strategy with no engine, and it would blow up the moment it was picked. It may look like duplication - do not merge it.
 */
export const LIVE_STRATEGY_IDS = [
  "lrs_v1",
  "rotation_v1",
  "trend_v1",
  "infinite_v4",
  "value_rebalancing",
] as const;

export type LiveStrategyId = (typeof LIVE_STRATEGY_IDS)[number];

/** The names used for the strategy options on the settings screen. */
export const LIVE_STRATEGY_LABEL: Record<LiveStrategyId, string> = {
  lrs_v1: "LRS",
  rotation_v1: "모멘텀 로테이션",
  trend_v1: "추세추종",
  infinite_v4: "무한매수 V4",
  value_rebalancing: "밸류리밸런싱 VR",
};

/** Whether a stored string is a live trading strategy. Used both for API validation and for narrowing. */
export function isLiveStrategy(v: unknown): v is LiveStrategyId {
  return typeof v === "string" && (LIVE_STRATEGY_IDS as readonly string[]).includes(v);
}

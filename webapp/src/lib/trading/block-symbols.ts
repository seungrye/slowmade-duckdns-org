/**
 * The symbols a block (portfolio) trades - pure (#372).
 *
 * Lifted out of the private helper inside `block-snapshot.ts`. The per-block asset snapshot and
 * fill attribution ask the **same question** ("which symbols does this block handle?"), and two
 * copies of the answer drift apart - which is exactly how #352 and #354 broke.
 *
 * | strategy | symbols |
 * |---|---|
 * | `infinite_v4` and `value_rebalancing` | `config.symbol` |
 * | `lrs_v1` | `config.target` |
 * | `trend_v1` | `config.universe` |
 * | `rotation_v1` | **unknown** (auto-selected candidates) -> `null` |
 *
 * Unknown is `null`, not an empty array - "handles no symbols" and "unknown" are different things.
 */
export function blockSymbols(config: Record<string, unknown>): string[] | null {
  if (typeof config.symbol === "string") return [config.symbol];
  if (typeof config.target === "string") return [config.target];
  if (Array.isArray(config.universe)) {
    return config.universe.filter((s): s is string => typeof s === "string");
  }
  // A strategy that auto-selects candidates, like rotation, cannot be known from config alone.
  return null;
}

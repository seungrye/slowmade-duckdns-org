/**
 * Fill -> block attribution - pure (#372).
 *
 * close-sync receives the **account's whole fill history** (US uses `usExecutionsAll` across every exchange).
 * But close-sync runs per block, and each run tagged every one of those fills with **its own strategy**.
 * With `$setOnInsert` the block that runs first claims them - invisible while there was one block, and wrong
 * from day one once VR joined the US account (#366):
 *
 *   2026-09-01, buy 64 SOXL
 *     tradingorderlogs (who actually ordered) -> value_rebalancing
 *     stocktrades (the record)                -> infinite_v4   <- wrong
 *
 * So a fill is attributed **only when the symbol has exactly one owner**. With none (an old record no block
 * claims) or two or more (an overlap) it stays on the account, untagged - what is unknown is not invented.
 */
import { blockSymbols } from "./block-symbols";

export type AttributionBlock = {
  id: string;
  strategy: string;
  config: Record<string, unknown>;
  /**
   * The day this block was created (YYYY-MM-DD). **Fills before it are not this block's.**
   *
   * close-sync re-sweeps 90 days of fills (`LOOKBACK_DAYS`). Without the date, the VR (SOXL) block created on
   * 2026-09-01 drags in **July's rotation_v1 SOXL trades**, and the v4 (TQQQ) block created on 07-17 drags in
   * **June's trend_v1 TQQQ trades**. Leave it empty to ignore dates.
   */
  since?: string;
};

export type FillOwner = { id: string; strategy: string };

type Claim = FillOwner & { since?: string };

/**
 * Builds a function from (symbol, fill date) to the owning block (walking the block list once).
 * null when no block, or more than one, claims that symbol that day.
 *
 * `recordedStrategy` is given only when revisiting **already-recorded trades** (the correction script). A block
 * document's `createdAt` is **the day the document was written**, not the day that strategy started running -
 * KRX 069500 moved from v1 to v4, so its trades start on 6/29 while the block document dates from 7/12. An
 * already-attached strategy is stronger evidence than the creation date, so when the date cannot decide, the
 * strategy decides.
 */
export function ownerLookup(
  blocks: AttributionBlock[],
): (ticker: string, date: string, recordedStrategy?: string) => FillOwner | null {
  const claims = new Map<string, Claim[]>();
  for (const b of blocks) {
    for (const sym of blockSymbols(b.config) ?? []) {
      const list = claims.get(sym) ?? claims.set(sym, []).get(sym)!;
      // One block listing the same symbol twice does not count as an overlap.
      if (!list.some((o) => o.id === b.id)) {
        list.push({ id: b.id, strategy: b.strategy, ...(b.since ? { since: b.since } : {}) });
      }
    }
  }
  const 벗기기 = (c: Claim): FillOwner => ({ id: c.id, strategy: c.strategy });
  return (ticker: string, date: string, recordedStrategy?: string) => {
    const all = claims.get(ticker) ?? [];
    const live = all.filter((c) => !c.since || date >= c.since);
    if (live.length === 1) return 벗기기(live[0]);
    if (recordedStrategy) {
      const 같은전략 = all.filter((c) => c.strategy === recordedStrategy);
      if (같은전략.length === 1) return 벗기기(같은전략[0]);
    }
    return null;
  };
}

/**
 * Symbols currently claimed by more than one block. Logged so nothing is quietly attributed to the account.
 * (Blocks with different creation dates are not checked for overlapping periods - this is a warning, so it casts wide.)
 */
export function contestedSymbols(blocks: AttributionBlock[]): string[] {
  const count = new Map<string, Set<string>>();
  for (const b of blocks) {
    for (const sym of blockSymbols(b.config) ?? []) {
      (count.get(sym) ?? count.set(sym, new Set()).get(sym)!).add(b.id);
    }
  }
  return [...count.entries()].filter(([, ids]) => ids.size > 1).map(([sym]) => sym).sort();
}

/**
 * Per-block asset snapshot - pure (#367 (2)).
 *
 * `portfoliohistories` was keyed only by (env, currency, date), so a US account with two blocks
 * (TQQQ v4 and SOXL VR) still had a single USD row. Worse, both blocks ran close-sync and
 * **overwrote the same slot** - it just never showed, because the account-wide values matched.
 *
 * A block row records **only what that block knows**. Each engine has its own cash ledger.
 *
 * | strategy | cash ledger | symbols |
 * |---|---|---|
 * | `infinite_v4` | `state.v4.cycleCash` | `config.symbol` |
 * | `value_rebalancing` | `state.vr.pool` | `config.symbol` |
 * | `trend_v1` | none | `config.universe` |
 * | `lrs_v1` | none | `config.target` |
 * | `rotation_v1` | none | **unknown** (auto-selected candidates) -> no row is written |
 *
 * The symbol table moved to `block-symbols.ts` (#372) - fill attribution asks the same question.
 *
 * With no ledger, `cash` is **null**. Writing 0 would be a **lie** meaning "there is no cash".
 * With unknown symbols it returns `null` so no row is written - nothing is invented.
 */

import { blockSymbols } from "./block-symbols";

export interface BlockSnapshot {
  /** That block's ledger cash. null for strategies with no ledger. */
  cash: number | null;
  holdingsValue: number;
  /** cash + holdingsValue, or holdingsValue when there is no cash. */
  totalValue: number;
  symbols: string[];
}

/** That block's ledger cash, or null. */
function ledgerCash(strategy: string, state: Record<string, unknown>): number | null {
  const 꺼내기 = (키: string, 필드: string): number | null => {
    const s = state[키] as Record<string, unknown> | undefined;
    const v = s?.[필드];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  if (strategy === "infinite_v4") return 꺼내기("v4", "cycleCash");
  if (strategy === "value_rebalancing") return 꺼내기("vr", "pool");
  return null;
}

export function blockSnapshot(args: {
  strategy: string;
  config: Record<string, unknown>;
  state: Record<string, unknown>;
  /** [symbol, qty, avgPrice, price] as close-sync already computed them. */
  evalRows: [string, number, number, number][];
  /** Total valuation from the broker. When > 0 the price slot of evalRows holds the **average price**, so it needs scaling. */
  hvBroker: number;
}): BlockSnapshot | null {
  const symbols = blockSymbols(args.config);
  if (!symbols) return null;

  const 내것 = new Set(symbols);
  const 값 = (r: [string, number, number, number]) => r[1] * r[3];
  let holdingsValue = args.evalRows.filter((r) => 내것.has(r[0])).reduce((s, r) => s + 값(r), 0);

  // On the branch that uses the broker's total valuation, the price slot is the average price, so the block value becomes **cost**.
  // Scale it proportionally so the total matches (exact per-symbol market prices are unknowable).
  if (args.hvBroker > 0) {
    const 원가합 = args.evalRows.reduce((s, r) => s + 값(r), 0);
    if (원가합 > 0) holdingsValue *= args.hvBroker / 원가합;
  }

  const cash = ledgerCash(args.strategy, args.state);
  return {
    cash,
    holdingsValue,
    totalValue: (cash ?? 0) + holdingsValue,
    symbols,
  };
}

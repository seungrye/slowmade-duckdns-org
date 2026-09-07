// Portfolio settings revisions - pure functions (#350).
//
// In #348 a US block's config was overwritten wholesale during a strategy switch and lost. With no backup and no
// oplog, 15 trading days of order logs and fills had to be reverse-engineered through floor() constraints, and even
// then principal was only narrowed to a $142 band. Recording the value at each change makes that impossible.
//
// This file knows nothing of the DB - only what counts as settings and what changed.

/** What goes in a revision = the values a person sets. Values the engine sets are not here. */
export const SETTING_KEYS = [
  "market", "strategy", "runAt", "weekdaysOnly", "enabled", "reservedCash", "config",
] as const;

export interface PortfolioSettings {
  market: string;
  strategy: string;
  runAt: string;
  weekdaysOnly: boolean;
  enabled: boolean;
  reservedCash: number;
  config: Record<string, unknown>;
}

/**
 * Extracts just the settings fields from the document.
 *
 * **Not including state is the point.** The engine rewrites T, cycleCash and lastRunDate on every run, so
 * including it would pile up revisions even on days the settings were never touched, making the history useless.
 * Being a whitelist, nothing leaks in however much the document grows.
 */
export function snapshotOf(doc: Record<string, unknown>): PortfolioSettings {
  return {
    market: String(doc.market ?? ""),
    strategy: String(doc.strategy ?? ""),
    runAt: String(doc.runAt ?? ""),
    weekdaysOnly: doc.weekdaysOnly !== false,
    enabled: doc.enabled !== false,
    reservedCash: Number(doc.reservedCash ?? 0) || 0,
    config: (doc.config ?? {}) as Record<string, unknown>,
  };
}

/** An order-insensitive deep comparison - config is free-form JSON, so differing only in key order is common. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b)
      && a.length === b.length && a.every((v, i) => same(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
    const kx = Object.keys(x), ky = Object.keys(y);
    return kx.length === ky.length && kx.every((k) => k in y && same(x[k], y[k]));
  }
  return false;
}

/**
 * The settings keys that changed, or an empty array when nothing did.
 *
 * **An empty array means no revision is created.** An upsert runs on every save-button press
 * (portfolios/route.ts), so without this rule the history fills with identical values and becomes useless.
 */
export function changedKeys(before: PortfolioSettings, after: PortfolioSettings): string[] {
  return SETTING_KEYS.filter((k) => !same(before[k], after[k]));
}

// Rotation candidate auto-selection - the most liquid (by traded value) of a vetted seed pool.
// The same rules as Python's stock-automator-v2 strategy/rotation_pool.py (cross-checked).
//
// - The seed is a fixed, human-vetted list (the leveraged bull names, inverse excluded - going to cash is already the defence).
//   Discovering the whole market automatically was rejected: name parsing is brittle and unvetted new products leak in.
// - Only one symbol per underlying index group - duplicate leverage on the same index destroys rotation's diversification.
// - Seeds with no traded-value data drop out, but remaining slots are topped up in seed order (deterministic).

export interface SeedEntry {
  ticker: string;
  group: string; // the underlying index group - only one symbol per group enters the pool
}

export const DEFAULT_POOL_SIZE = 4;
export const DEFAULT_LIQ_DAYS = 20; // averaging window for traded value (trading days)

// US - the 3x leveraged bull names (the same order as Python's US_SEED).
export const US_SEED: SeedEntry[] = [
  { ticker: "TQQQ", group: "nasdaq100" },
  { ticker: "SOXL", group: "semis" },
  { ticker: "UPRO", group: "sp500" },
  { ticker: "TECL", group: "tech" },
  { ticker: "TNA", group: "russell2000" },
  { ticker: "FAS", group: "financials" },
  { ticker: "LABU", group: "biotech" },
];

// KRX - locally listed leverage (2x is the maximum). Index and sector funds only, single-stock leverage excluded (the same as Python's KR_SEED).
export const KR_SEED: SeedEntry[] = [
  { ticker: "122630", group: "kospi200" }, // KODEX 레버리지
  { ticker: "233740", group: "kosdaq150" }, // KODEX 코스닥150레버리지
  { ticker: "409820", group: "nasdaq100" }, // KODEX 미국나스닥100레버리지(합성 H)
  { ticker: "423920", group: "sox" }, // TIGER 미국필라델피아반도체레버리지(합성)
  { ticker: "418660", group: "nasdaq100" }, // TIGER 미국나스닥100레버리지(합성) — 409820 과 그룹 경쟁
  { ticker: "494310", group: "kr_semis" }, // KODEX 반도체레버리지(2024-10 상장)
  { ticker: "243880", group: "kospi200it" }, // TIGER 200IT레버리지
  { ticker: "462330", group: "battery" }, // KODEX 2차전지산업레버리지
];

/** Average traded value (close x volume) over the last `days`, from an oldest-to-newest series. null if short or 0. */
export function liquidityMetric(values: number[], days: number = DEFAULT_LIQ_DAYS): number | null {
  if (values.length < days) return null;
  let sum = 0;
  for (let i = values.length - days; i < values.length; i++) sum += values[i];
  const avg = sum / days;
  return avg > 0 ? avg : null;
}

/** Selects the topN by traded value - one per group, topping up from the seed order when data is missing (the same as Python's select_pool). */
export function selectPool(
  seed: SeedEntry[],
  metrics: Record<string, number | null>,
  topN: number = DEFAULT_POOL_SIZE,
): string[] {
  const picked: string[] = [];
  const groups = new Set<string>();
  const scored = seed
    .filter((s) => metrics[s.ticker] !== null && metrics[s.ticker] !== undefined)
    .sort((a, b) => metrics[b.ticker]! - metrics[a.ticker]!); // Array.sort is stable, so ties keep the seed order
  for (const s of scored) {
    if (picked.length >= topN) break;
    if (groups.has(s.group)) continue;
    picked.push(s.ticker);
    groups.add(s.group);
  }
  for (const s of seed) {
    if (picked.length >= topN) break;
    if (picked.includes(s.ticker) || groups.has(s.group)) continue;
    picked.push(s.ticker);
    groups.add(s.group);
  }
  return picked;
}

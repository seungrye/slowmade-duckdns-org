// rotation 자동선발 TS↔py 교차 대조 (일회성) — py 캐시 일봉(JSON, volume 포함)으로
// runRotationBacktest(autoSeed=US_SEED)를 py 기본 파라미터와 동일하게 실행해 비교한다.
//   pnpm dlx tsx scripts/rotation-auto-compare.mts <barsDir> [us|kr]
import { readFileSync } from "node:fs";
import { runRotationBacktest } from "../src/lib/backtest/rotation";
import { KR_SEED, US_SEED } from "../src/lib/backtest/rotation-pool";
import type { Bar } from "../src/lib/backtest/types";

const dir = process.argv[2];
const market = process.argv[3] ?? "us";
const seed = market === "kr" ? KR_SEED : US_SEED;
const load = (t: string): Bar[] => JSON.parse(readFileSync(`${dir}/bars-${t}.json`, "utf-8"));
const cands = seed.map((s) => ({ ticker: s.ticker, bars: load(s.ticker) }));
const signal = load(market === "kr" ? "069500" : "QQQ");

const principal = market === "kr" ? 10_000_000 : 10_000;
const r = runRotationBacktest(cands, signal, {
  principal, smaPeriod: 200, bandPct: 0.01, momDays: 126, rebalanceDays: 63,
  autoSeed: seed,
});
const finalEq = r.equityCurve.at(-1)?.equity ?? principal;
console.log(`trades=${r.trades.length} totalPnl=${r.totalPnl.toFixed(2)} final=${finalEq.toFixed(2)} (${((finalEq / principal - 1) * 100).toFixed(1)}%)`);
console.log(`poolLog ${r.poolLog!.length}건 — 마지막 3건:`);
for (const l of r.poolLog!.slice(-3)) console.log("  " + l);

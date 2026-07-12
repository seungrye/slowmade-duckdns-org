// rotation 자동선발 TS↔py 교차 대조 (일회성) — py 캐시 일봉(JSON, volume 포함)으로
// runRotationBacktest(autoSeed=US_SEED)를 py 기본 파라미터와 동일하게 실행해 비교한다.
//   pnpm dlx tsx scripts/rotation-auto-compare.mts <barsDir>
import { readFileSync } from "node:fs";
import { runRotationBacktest } from "../src/lib/backtest/rotation";
import { US_SEED } from "../src/lib/backtest/rotation-pool";
import type { Bar } from "../src/lib/backtest/types";

const dir = process.argv[2];
const load = (t: string): Bar[] => JSON.parse(readFileSync(`${dir}/bars-${t}.json`, "utf-8"));
const cands = US_SEED.map((s) => ({ ticker: s.ticker, bars: load(s.ticker) }));
const signal = load("QQQ");

const r = runRotationBacktest(cands, signal, {
  principal: 10000, smaPeriod: 200, bandPct: 0.01, momDays: 126, rebalanceDays: 63,
  autoSeed: US_SEED,
});
const finalEq = r.equityCurve.at(-1)?.equity ?? 10000;
console.log(`trades=${r.trades.length} totalPnl=${r.totalPnl.toFixed(2)} final=${finalEq.toFixed(2)} (${((finalEq / 10000 - 1) * 100).toFixed(1)}%)`);
console.log(`poolLog ${r.poolLog!.length}건 — 마지막 3건:`);
for (const l of r.poolLog!.slice(-3)) console.log("  " + l);

// 크로스섹셔널 팩터 3종 + 벤치마크 비교(실 Mongo 데이터). 라우트 로직 검증 + 비교 수치 산출.
// 실행: node --env-file=.env.local --import tsx scripts/factor-compare.mts
import mongoose from "mongoose";
import { UNIVERSES } from "../src/lib/trading/universes";
import { runFactorComparison, DEFAULT_FACTOR_PARAMS, type FactorMatrix } from "../src/lib/backtest/factor";

const MARKET: Record<string, { u: string; etf: string }> = {
  us: { u: "sp500-us", etf: "SPY" },
  kr: { u: "kospi200-kr", etf: "069500" },
};
const FROM = "2015-01-01";
const TO = "2024-12-31";
const minusDays = (d: string, n: number) => new Date(new Date(d).getTime() - n * 86400000).toISOString().slice(0, 10);

async function loadMatrix(syms: string[], etf: string): Promise<FactorMatrix> {
  const coll = mongoose.connection.collection("stockdailyprices");
  const load = [...new Set([...syms, etf])];
  const rows = (await coll
    .find({ ticker: { $in: load }, date: { $gte: minusDays(FROM, 500), $lte: TO } }, { projection: { ticker: 1, date: 1, close: 1, _id: 0 } })
    .toArray()) as unknown as { ticker: string; date: string; close: number }[];
  const byT = new Map<string, Map<string, number>>();
  const ds = new Set<string>();
  for (const r of rows) {
    if (r.close == null) continue;
    ds.add(r.date);
    let m = byT.get(r.ticker);
    if (!m) { m = new Map(); byT.set(r.ticker, m); }
    m.set(r.date, r.close);
  }
  const dates = [...ds].sort();
  const closes = new Map<string, (number | null)[]>();
  for (const [t, m] of byT) closes.set(t, dates.map((d) => m.get(d) ?? null));
  return { dates, closes };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI as string);
  for (const mk of ["us", "kr"] as const) {
    const { u, etf } = MARKET[mk];
    const mtx = await loadMatrix(UNIVERSES[u], etf);
    const rows = runFactorComparison(mtx, { from: FROM, to: TO, marketTicker: etf, params: { ...DEFAULT_FACTOR_PARAMS, quantile: 0.2 } });
    console.log(`\n=== ${mk.toUpperCase()} (${u}, 로드종목 ${mtx.closes.size}, 거래일 ${mtx.dates.length}) ${FROM}~${TO} ===`);
    console.log("전략             |  총수익% |  CAGR% |   MDD% | Sharpe | Calmar");
    for (const r of rows) {
      const m = r.metrics;
      console.log(
        `${r.name.padEnd(15)} | ${m.totalReturnPct.toFixed(1).padStart(7)} | ${m.cagr.toFixed(1).padStart(5)} | ${m.mdd.toFixed(1).padStart(5)} | ${m.sharpe.toFixed(2).padStart(6)} | ${m.calmar.toFixed(2).padStart(6)}`,
      );
    }
  }
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

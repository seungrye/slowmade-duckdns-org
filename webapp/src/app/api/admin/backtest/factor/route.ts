import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import StockDailyPrice from "@/models/stock-daily-price";
import { UNIVERSES } from "@/lib/trading/universes";
import { runFactorComparison, DEFAULT_FACTOR_PARAMS, type FactorMatrix } from "@/lib/backtest/factor";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Loading and computing a multi-symbol universe can take seconds to tens of seconds

const MARKET_MAP: Record<string, { universe: string; etf: string }> = {
  us: { universe: "sp500-us", etf: "SPY" },
  kr: { universe: "kospi200-kr", etf: "069500" },
};

const SURVIVORSHIP_NOTE =
  "유니버스가 현재 구성종목 기준이라 상장폐지 종목 제외로 결과가 낙관 편향(생존편향). 거래비용·슬리피지 미반영.";

/** The date string `days` before from (YYYY-MM-DD) - the lookback buffer. */
function minusDays(dateStr: string, days: number): string {
  return new Date(new Date(dateStr).getTime() - days * 86400000).toISOString().slice(0, 10);
}

/**
 * GET /api/admin/backtest/factor?market=us|kr&from=YYYY-MM-DD&to=YYYY-MM-DD&quantile=0.2&principal=10000&contribution=0
 *
 * The cross-sectional factor backtest (server side) - three factors (low volatility, momentum, mean reversion) plus
 * the benchmarks (equal weight and a market ETF), run and compared over the same period with the same principal and
 * contributions. The universe's closes are loaded by the server directly from Mongo (stockdailyprices).
 *
 * The dates match the other strategy tabs: **an empty from means the whole history, an empty to means today**. Given
 * a principal and a monthly contribution it produces real-money accumulating curves plus TWR metrics (computeMetrics).
 */
export async function GET(req: NextRequest) {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) return guard;

  const sp = req.nextUrl.searchParams;
  const market = (sp.get("market") ?? "us").trim();
  const cfg = MARKET_MAP[market];
  if (!cfg) return NextResponse.json({ error: "market 은 us|kr" }, { status: 400 });

  const fromRaw = (sp.get("from") ?? "").trim(); // empty = the whole history
  const to = (sp.get("to") ?? "").trim() || new Date().toISOString().slice(0, 10); // empty = today
  const quantile = Math.min(0.5, Math.max(0.05, Number(sp.get("quantile") ?? 0.2) || 0.2));
  const principal = Math.max(0, Number(sp.get("principal") ?? 10000) || 0);
  const contribution = Math.max(0, Number(sp.get("contribution") ?? 0) || 0);
  const params = { ...DEFAULT_FACTOR_PARAMS, quantile };

  const syms = UNIVERSES[cfg.universe] ?? [];
  const loadSyms = Array.from(new Set([...syms, cfg.etf]));
  // With from given, an extra lookback buffer (about 500 calendar days) is loaded before it. With from empty it loads the whole history (no lower bound).
  const dateFilter: Record<string, string> = { $lte: to };
  if (fromRaw) dateFilter.$gte = minusDays(fromRaw, 500);

  await connectToDB();
  const rows = await StockDailyPrice.find(
    { ticker: { $in: loadSyms }, date: dateFilter },
    { ticker: 1, date: 1, close: 1, _id: 0 },
  ).lean<{ ticker: string; date: string; close: number }[]>();

  // ticker -> (date -> close) plus the full trading-day axis
  const byTicker = new Map<string, Map<string, number>>();
  const dateSet = new Set<string>();
  for (const r of rows) {
    if (r.close == null) continue;
    dateSet.add(r.date);
    let mp = byTicker.get(r.ticker);
    if (!mp) {
      mp = new Map();
      byTicker.set(r.ticker, mp);
    }
    mp.set(r.date, r.close);
  }
  const dates = [...dateSet].sort();
  const closes = new Map<string, (number | null)[]>();
  for (const [t, mp] of byTicker) {
    closes.set(t, dates.map((d) => mp.get(d) ?? null));
  }
  const matrix: FactorMatrix = { dates, closes };

  // With from empty, the effective start is the first investment day after the factor lookback warm-up (momLong trading days in). Given, it is used as is.
  const from = fromRaw || (dates.length ? dates[Math.min(params.momLong, dates.length - 1)] : to);

  const strategies = runFactorComparison(matrix, {
    from,
    to,
    marketTicker: cfg.etf,
    params,
    principal,
    contribution,
  });

  return NextResponse.json({
    market,
    universe: cfg.universe,
    universeSize: byTicker.size,
    from,
    to,
    quantile,
    principal,
    contribution,
    note: SURVIVORSHIP_NOTE,
    strategies,
  });
}

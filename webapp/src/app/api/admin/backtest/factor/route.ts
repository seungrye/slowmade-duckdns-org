import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import StockDailyPrice from "@/models/stock-daily-price";
import { UNIVERSES } from "@/lib/trading/universes";
import { runFactorComparison, DEFAULT_FACTOR_PARAMS, type FactorMatrix } from "@/lib/backtest/factor";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 유니버스 다종목 로드·연산은 수 초~수십 초 소요될 수 있음

const MARKET_MAP: Record<string, { universe: string; etf: string }> = {
  us: { universe: "sp500-us", etf: "SPY" },
  kr: { universe: "kospi200-kr", etf: "069500" },
};

const SURVIVORSHIP_NOTE =
  "유니버스가 현재 구성종목 기준이라 상장폐지 종목 제외로 결과가 낙관 편향(생존편향). 거래비용·슬리피지 미반영.";

/** from(YYYY-MM-DD) 에서 days 일 이전(룩백 버퍼) 날짜 문자열. */
function minusDays(dateStr: string, days: number): string {
  return new Date(new Date(dateStr).getTime() - days * 86400000).toISOString().slice(0, 10);
}

/**
 * GET /api/admin/backtest/factor?market=us|kr&from=YYYY-MM-DD&to=YYYY-MM-DD&quantile=0.2
 *
 * 크로스섹셔널 팩터 백테스트(서버측) — 저변동성·모멘텀·평균회귀 3종 + 벤치마크(동일가중·시장ETF)를
 * 같은 기간으로 실행·비교. 유니버스 종가는 Mongo(stockdailyprices)에서 서버가 직접 로드(브라우저 병목 회피).
 */
export async function GET(req: NextRequest) {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) return guard;

  const sp = req.nextUrl.searchParams;
  const market = (sp.get("market") ?? "us").trim();
  const cfg = MARKET_MAP[market];
  if (!cfg) return NextResponse.json({ error: "market 은 us|kr" }, { status: 400 });

  const from = (sp.get("from") ?? "2015-01-01").trim();
  const to = (sp.get("to") ?? "2024-12-31").trim();
  const quantile = Math.min(0.5, Math.max(0.05, Number(sp.get("quantile") ?? 0.2) || 0.2));

  const syms = UNIVERSES[cfg.universe] ?? [];
  const loadSyms = Array.from(new Set([...syms, cfg.etf]));
  const bufferFrom = minusDays(from, 500); // 252 거래일 룩백 여유(달력일 ~500)

  await connectToDB();
  const rows = await StockDailyPrice.find(
    { ticker: { $in: loadSyms }, date: { $gte: bufferFrom, $lte: to } },
    { ticker: 1, date: 1, close: 1, _id: 0 },
  ).lean<{ ticker: string; date: string; close: number }[]>();

  // ticker -> (date -> close) + 전체 거래일 축
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

  const strategies = runFactorComparison(matrix, {
    from,
    to,
    marketTicker: cfg.etf,
    params: { ...DEFAULT_FACTOR_PARAMS, quantile },
  });

  return NextResponse.json({
    market,
    universe: cfg.universe,
    universeSize: byTicker.size,
    from,
    to,
    quantile,
    note: SURVIVORSHIP_NOTE,
    strategies,
  });
}

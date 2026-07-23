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
 * GET /api/admin/backtest/factor?market=us|kr&from=YYYY-MM-DD&to=YYYY-MM-DD&quantile=0.2&principal=10000&contribution=0
 *
 * 크로스섹셔널 팩터 백테스트(서버측) — 저변동성·모멘텀·평균회귀 3종 + 벤치마크(동일가중·시장ETF)를
 * 같은 기간·같은 원금/적립으로 실행·비교. 유니버스 종가는 Mongo(stockdailyprices)에서 서버가 직접 로드.
 *
 * 날짜는 다른 전략 탭과 일관: **from 비우면 전체 이력, to 비우면 오늘**. 원금(principal)·월적립금
 * (contribution)을 주면 실제 금액·적립식 곡선 + TWR 지표(computeMetrics)를 낸다.
 */
export async function GET(req: NextRequest) {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) return guard;

  const sp = req.nextUrl.searchParams;
  const market = (sp.get("market") ?? "us").trim();
  const cfg = MARKET_MAP[market];
  if (!cfg) return NextResponse.json({ error: "market 은 us|kr" }, { status: 400 });

  const fromRaw = (sp.get("from") ?? "").trim(); // 빈값 = 전체 이력
  const to = (sp.get("to") ?? "").trim() || new Date().toISOString().slice(0, 10); // 빈값 = 오늘
  const quantile = Math.min(0.5, Math.max(0.05, Number(sp.get("quantile") ?? 0.2) || 0.2));
  const principal = Math.max(0, Number(sp.get("principal") ?? 10000) || 0);
  const contribution = Math.max(0, Number(sp.get("contribution") ?? 0) || 0);
  const params = { ...DEFAULT_FACTOR_PARAMS, quantile };

  const syms = UNIVERSES[cfg.universe] ?? [];
  const loadSyms = Array.from(new Set([...syms, cfg.etf]));
  // from 지정 시 룩백 버퍼(달력일 ~500)만큼 앞을 더 로드. from 비우면 전체 이력 로드(하한 없음).
  const dateFilter: Record<string, string> = { $lte: to };
  if (fromRaw) dateFilter.$gte = minusDays(fromRaw, 500);

  await connectToDB();
  const rows = await StockDailyPrice.find(
    { ticker: { $in: loadSyms }, date: dateFilter },
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

  // from 비우면 유효 시작 = 팩터 룩백 워밍업 후 첫 투자일(momLong 거래일 뒤). 지정 시 그대로.
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

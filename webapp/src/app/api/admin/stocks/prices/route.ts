import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import StockDailyPrice from "@/models/stock-daily-price";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/stocks/prices
 *   ?tickers=AAPL,TSLA,005930&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=N
 *
 * 다중 종목 일봉 — 멀티 line chart 용 (#사이클A 멀티 UI).
 *
 * 반환: { byTicker: { ticker: [{date, close}, ...] }, requested, missing }
 *
 * - tickers 콤마 분리, 최대 20 개 (UI 가시성 한계 + 부하 가드).
 * - from/to 누락 시 최근 365일.
 * - limit 누락 시 각 종목당 1000일.
 */
const MAX_TICKERS = 20;
const DEFAULT_DAYS = 365;
const DEFAULT_LIMIT = 1000;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) return guard;

  const tickersRaw = req.nextUrl.searchParams.get("tickers") ?? "";
  const requested = tickersRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_TICKERS);
  if (requested.length === 0) {
    return NextResponse.json({ byTicker: {}, requested: [], missing: [] });
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw
    ? Math.min(Math.max(parseInt(limitRaw, 10), 1), 5000)
    : DEFAULT_LIMIT;

  const today = new Date();
  const past = new Date(today.getTime() - DEFAULT_DAYS * 86400 * 1000);
  const fromStr = from || ymd(past);
  const toStr = to || ymd(today);

  await connectToDB();
  const docs = await StockDailyPrice.find({
    ticker: { $in: requested },
    date: { $gte: fromStr, $lte: toStr },
  })
    .select({ ticker: 1, date: 1, close: 1, _id: 0 })
    .sort({ ticker: 1, date: 1 })
    .limit(limit * requested.length)
    .lean();

  const byTicker: Record<string, Array<{ date: string; close: number }>> = {};
  for (const t of requested) byTicker[t] = [];
  for (const d of docs) {
    byTicker[d.ticker]?.push({ date: d.date, close: d.close });
  }
  const missing = requested.filter((t) => byTicker[t].length === 0);

  return NextResponse.json({ byTicker, requested, missing, from: fromStr, to: toStr });
}

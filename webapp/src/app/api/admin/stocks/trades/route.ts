import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import StockTrade from "@/models/stock-trade";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/stocks/trades
 *   ?tickers=AAPL,005930&env=paper&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Multi-symbol trades - the chart markers (a triangle for a buy, an inverted one for a sell).
 * Without env it includes both paper and real.
 *
 * Returns: { byTicker: { ticker: [{date, time, action, price, qty, env}, ...] } }
 */
const MAX_TICKERS = 20;

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
    return NextResponse.json({ byTicker: {} });
  }
  const envParam = req.nextUrl.searchParams.get("env");
  const env = envParam && /^[a-z0-9][a-z0-9-]{0,40}$/.test(envParam) ? envParam : null;

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const query: Record<string, unknown> = { ticker: { $in: requested }, hidden: { $ne: true } };
  if (env) query.env = env;
  if (from || to) {
    const range: Record<string, string> = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    query.date = range;
  }

  await connectToDB();
  const docs = await StockTrade.find(query)
    .select({ ticker: 1, action: 1, strategy: 1, date: 1, time: 1, price: 1, qty: 1, cumulativeQty: 1, env: 1, _id: 0 })
    .sort({ ticker: 1, time: 1 })
    .lean();

  const byTicker: Record<string, typeof docs> = {};
  for (const t of requested) byTicker[t] = [];
  for (const d of docs) byTicker[d.ticker]?.push(d);

  return NextResponse.json({ byTicker });
}

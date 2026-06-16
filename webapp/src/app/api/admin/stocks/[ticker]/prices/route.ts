import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import StockDailyPrice from "@/models/stock-daily-price";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ticker: string }> };

/**
 * GET /api/admin/stocks/[ticker]/prices
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=N
 *
 * owner 전용 일봉 시계열 (date asc).
 */
export async function GET(req: NextRequest, { params }: Params) {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) return guard;

  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker);
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10), 1), 5000) : 1000;

  const query: Record<string, unknown> = { ticker };
  if (from || to) {
    const range: Record<string, string> = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    query.date = range;
  }

  await connectToDB();
  const prices = await StockDailyPrice.find(query)
    .select({ date: 1, open: 1, high: 1, low: 1, close: 1, volume: 1, _id: 0 })
    .sort({ date: 1 })
    .limit(limit)
    .lean();

  return NextResponse.json({ ticker, count: prices.length, prices });
}

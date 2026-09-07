import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import StockDailyPrice from "@/models/stock-daily-price";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/backtest/prices?ticker=TQQQ&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * A single symbol's OHLC daily bars - the input for the browser backtest (which computes on the client).
 * A source without open/high/low (where only the close is stored) substitutes the close.
 *
 * Returns: { ticker, bars: [{date, open, high, low, close, volume}, ...] }
 */
export async function GET(req: NextRequest) {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) return guard;

  const ticker = (req.nextUrl.searchParams.get("ticker") ?? "").trim();
  if (!ticker) return NextResponse.json({ ticker: "", bars: [] });

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const query: Record<string, unknown> = { ticker };
  if (from || to) {
    const range: Record<string, string> = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    query.date = range;
  }

  await connectToDB();
  const docs = await StockDailyPrice.find(query)
    .select({ date: 1, open: 1, high: 1, low: 1, close: 1, volume: 1, _id: 0 })
    .sort({ date: 1 })
    .limit(10000)
    .lean();

  const bars = docs.map((d) => {
    const close = d.close as number;
    return {
      date: d.date as string,
      open: (d.open as number | null) ?? close,
      high: (d.high as number | null) ?? close,
      low: (d.low as number | null) ?? close,
      close,
      volume: (d.volume as number | null) ?? 0, // rotation 후보 자동선발(거래대금)용
    };
  });

  return NextResponse.json({ ticker, bars });
}

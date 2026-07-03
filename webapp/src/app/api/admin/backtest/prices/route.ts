import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import StockDailyPrice from "@/models/stock-daily-price";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/backtest/prices?ticker=TQQQ&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * 단일 종목 OHLC 일봉 — 브라우저 백테스트 입력용(연산은 클라이언트에서).
 * open/high/low 가 없는 소스(close 만 저장된 경우)는 close 로 대체한다.
 *
 * 반환: { ticker, bars: [{date, open, high, low, close}, ...] }
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
    .select({ date: 1, open: 1, high: 1, low: 1, close: 1, _id: 0 })
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
    };
  });

  return NextResponse.json({ ticker, bars });
}

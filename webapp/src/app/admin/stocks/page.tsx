import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import Stock from "@/models/stock";
import MultiChartClient from "./multi-chart-client";

export const dynamic = "force-dynamic";

/**
 * /admin/stocks - the owner-only multi-symbol closing-price line chart.
 *
 * The server component loads every symbol's metadata (716 symbols) and passes it to the client
 * as a prop, so autocomplete is handled instantly on the client. Daily bars are fetched from
 * /api/admin/stocks/prices when the user selects a symbol.
 *
 * Symbols can be shared or bookmarked through the URL as ?tickers=AAPL,005930.
 */
export default async function StocksMultiChartPage() {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) notFound();

  await connectToDB();
  const stocks = await Stock.find({ isDeleted: { $ne: true } })
    .select({ ticker: 1, name: 1, market: 1, indices: 1, _id: 0 })
    .sort({ market: 1, ticker: 1 })
    .lean();

  // The Mongoose lean result -> serialised into flat plain objects (to pass to the client component)
  const stockMeta = stocks.map((s) => ({
    ticker: s.ticker,
    name: s.name,
    market: s.market as "KR" | "US",
    indices: s.indices ?? [],
  }));

  return (
    <main className="mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">종목 차트</h1>
      <p className="text-sm text-gray-500 mb-6">
        owner 전용 · 종목을 추가하면 같은 차트에 종가 line 이 그려집니다 (최대 8 종목)
      </p>
      <MultiChartClient stocks={stockMeta} />
    </main>
  );
}

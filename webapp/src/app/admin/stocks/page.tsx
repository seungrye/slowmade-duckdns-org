import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import Stock from "@/models/stock";
import MultiChartClient from "./multi-chart-client";

export const dynamic = "force-dynamic";

/**
 * /admin/stocks — owner 전용 멀티 종목 종가 line chart.
 *
 * server component 가 종목 메타 (716 종목) 전부 load → client 에 prop 전달
 * → 자동완성 검색을 클라이언트 즉시 처리. 일봉은 사용자가 종목 선택 시
 * /api/admin/stocks/prices 로 fetch.
 *
 * URL ?tickers=AAPL,005930 형식으로 종목 공유/북마크 가능.
 */
export default async function StocksMultiChartPage() {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) notFound();

  await connectToDB();
  const stocks = await Stock.find({ isDeleted: { $ne: true } })
    .select({ ticker: 1, name: 1, market: 1, indices: 1, _id: 0 })
    .sort({ market: 1, ticker: 1 })
    .lean();

  // Mongoose lean 결과 → 평면 plain object 로 직렬화 (client component 전달용)
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

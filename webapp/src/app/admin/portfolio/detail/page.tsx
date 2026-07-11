import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import StockTrade from "@/models/stock-trade";
import StockDailyPrice from "@/models/stock-daily-price";
import Stock from "@/models/stock";
import { getPortfolioData, type Env, type Currency } from "@/lib/portfolio";
import PortfolioDetailClient from "./portfolio-detail-client";

export const dynamic = "force-dynamic";

/**
 * /admin/portfolio/detail?env=&currency=&center= — 매매 차트 마커 클릭 시 이동하는 상세 페이지.
 *
 * 그 (env, currency)의 매매 종목 주가 라인 + 매수/매도 마커 차트와,
 * 매매 기록 + 날짜별 포트폴리오(총재산/현금/평가액) 표를 함께 보여준다.
 */
export default async function PortfolioDetailPage(props: {
  searchParams: Promise<{ env?: string; currency?: string; center?: string }>;
}) {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) notFound();

  const sp = await props.searchParams;
  const env: Env = typeof sp.env === "string" && /^[a-z0-9][a-z0-9-]{0,40}$/.test(sp.env) ? sp.env : "paper";
  const currency: Currency = sp.currency === "USD" ? "USD" : "KRW";
  const center = sp.center ?? null;

  await connectToDB();

  const tradeDocs = await StockTrade.find({ env, currency })
    .select({ ticker: 1, action: 1, qty: 1, cumulativeQty: 1, price: 1, amount: 1, date: 1, time: 1, strategy: 1, _id: 0 })
    .sort({ date: 1, time: 1 })
    .lean();
  const trades = tradeDocs.map((t) => ({
    ticker: t.ticker as string,
    action: t.action as "buy" | "sell",
    qty: (t.qty as number) ?? 0,
    cumulativeQty: (t.cumulativeQty as number) ?? 0,
    price: (t.price as number) ?? 0,
    amount: (t.amount as number) || ((t.price as number) ?? 0) * ((t.qty as number) ?? 0),
    date: t.date as string,
    strategy: (t.strategy as string) ?? "",
  }));

  const tickers = Array.from(new Set(trades.map((t) => t.ticker)));

  // 주가는 최근 ~180일 조회 — 종목 선택 차트의 SMA60(60거래일) 이동평균이 충분히
  // 보이도록 warmup 포함. 렌더는 선택 1종목뿐이라 부담 작다.
  // date 는 "YYYY-MM-DD" 문자열이라 사전순 비교($gte)가 날짜순과 일치.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);
  const fromDate = cutoff.toISOString().slice(0, 10);
  const priceDocs = tickers.length
    ? await StockDailyPrice.find({ ticker: { $in: tickers }, date: { $gte: fromDate } })
        .select({ ticker: 1, date: 1, close: 1, _id: 0 })
        .sort({ date: 1 })
        .lean()
    : [];
  const pricesByTicker: Record<string, { date: string; close: number }[]> = {};
  for (const p of priceDocs) {
    (pricesByTicker[p.ticker as string] ??= []).push({ date: p.date as string, close: p.close as number });
  }

  const nameDocs = tickers.length
    ? await Stock.find({ ticker: { $in: tickers } }).select({ ticker: 1, name: 1, _id: 0 }).lean()
    : [];
  const names: Record<string, string> = {};
  for (const n of nameDocs) names[n.ticker as string] = n.name as string;

  const { history } = await getPortfolioData(env, currency);

  return (
    <PortfolioDetailClient
      env={env}
      currency={currency}
      center={center}
      trades={trades}
      pricesByTicker={pricesByTicker}
      names={names}
      history={history}
    />
  );
}

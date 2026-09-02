import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import StockTrade from "@/models/stock-trade";
import StockDailyPrice from "@/models/stock-daily-price";
import Stock from "@/models/stock";
import { ETF_NAMES } from "@/lib/trading/universes";
import { getPortfolioData, type Env, type Currency } from "@/lib/portfolio";
import TradingPortfolio from "@/models/trading-portfolio";
import TradingAccount from "@/models/trading-account";
import PortfolioDetailClient from "./portfolio-detail-client";

export const dynamic = "force-dynamic";

/**
 * /admin/portfolio/detail?env=&currency=&center= — 매매 차트 마커 클릭 시 이동하는 상세 페이지.
 *
 * 그 (env, currency)의 매매 종목 주가 라인 + 매수/매도 마커 차트와,
 * 매매 기록 + 날짜별 포트폴리오(총재산/현금/평가액) 표를 함께 보여준다.
 */
export default async function PortfolioDetailPage(props: {
  searchParams: Promise<{ env?: string; currency?: string; center?: string; portfolioId?: string }>;
}) {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) notFound();

  const sp = await props.searchParams;
  const env: Env = typeof sp.env === "string" && /^[a-z0-9][a-z0-9-]{0,40}$/.test(sp.env) ? sp.env : "paper";
  const currency: Currency = sp.currency === "USD" ? "USD" : "KRW";
  const center = sp.center ?? null;
  // 24자리 hex 만 통과시킨다 — 아니면 mongoose 캐스팅이 던진다.
  const portfolioId = /^[0-9a-f]{24}$/.test(sp.portfolioId ?? "") ? sp.portfolioId! : null;

  await connectToDB();

  // 블록 탭 — 이 계정·시장의 살아있는 블록들 (#374).
  const market = currency === "KRW" ? "kr" : "us";
  const account = await TradingAccount.findOne({ envKey: env, isDeleted: { $ne: true } })
    .select({ _id: 1 }).lean();
  const blockDocs = account
    ? await TradingPortfolio.find({ accountId: account._id, market, isDeleted: { $ne: true } })
        .select({ strategy: 1 }).lean()
    : [];
  const blocks = blockDocs.map((b) => ({ portfolioId: String(b._id), strategy: String(b.strategy ?? "") }));
  // 없는 블록을 가리키면 전체로 되돌린다(링크가 낡았을 때 빈 화면 대신).
  const selected = blocks.some((b) => b.portfolioId === portfolioId) ? portfolioId : null;

  const tradeDocs = await StockTrade.find({
    env, currency, hidden: { $ne: true },
    ...(selected ? { portfolioId: selected } : {}),
  })
    .select({ ticker: 1, action: 1, qty: 1, cumulativeQty: 1, price: 1, amount: 1, date: 1, time: 1, strategy: 1, portfolioId: 1, _id: 0 })
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

  // 주가는 최근 1년 조회. **처음 보이는 창은 여전히 데스크톱 90일·모바일 30일**이고
  // (아래 dataZoom), 데이터를 넉넉히 넘겨야 밀어서 1년까지 볼 수 있다 (#133).
  // SMA60 warmup 도 자연히 포함된다. 렌더는 선택 1종목뿐이라 부담 작다.
  // date 는 "YYYY-MM-DD" 문자열이라 사전순 비교($gte)가 날짜순과 일치.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 365);
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
  // stocks 에 없는 지수/레버리지 ETF(예: 069500=KODEX 200)는 ETF_NAMES 로 보완 — DB 이름 우선.
  for (const tk of tickers) if (!names[tk] && ETF_NAMES[tk]) names[tk] = ETF_NAMES[tk];

  // 블록을 고르면 그 블록의 스냅샷을, 아니면 계좌 스냅샷을 보여준다 (#374).
  const { history, blocks: series } = await getPortfolioData(env, currency);
  const shown = selected
    ? (series.find((b) => b.portfolioId === selected)?.history ?? [])
    : history;

  return (
    <PortfolioDetailClient
      env={env}
      currency={currency}
      center={center}
      trades={trades}
      pricesByTicker={pricesByTicker}
      names={names}
      history={shown}
      blocks={blocks}
      portfolioId={selected}
    />
  );
}

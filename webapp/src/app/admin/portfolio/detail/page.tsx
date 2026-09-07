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
 * /admin/portfolio/detail?env=&currency=&center= - the detail page a trade chart marker links to.
 *
 * It shows a chart of that (env, currency)'s traded symbols' price lines with buy and sell markers,
 * plus the trade records and a per-date portfolio table (total assets, cash and valuation).
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
  // Only 24 hex characters pass - anything else makes mongoose's cast throw.
  const portfolioId = /^[0-9a-f]{24}$/.test(sp.portfolioId ?? "") ? sp.portfolioId! : null;

  await connectToDB();

  // The block tabs - this account and market's live blocks (#374).
  const market = currency === "KRW" ? "kr" : "us";
  const account = await TradingAccount.findOne({ envKey: env, isDeleted: { $ne: true } })
    .select({ _id: 1 }).lean();
  const blockDocs = account
    ? await TradingPortfolio.find({ accountId: account._id, market, isDeleted: { $ne: true } })
        .select({ strategy: 1 }).lean()
    : [];
  const blocks = blockDocs.map((b) => ({ portfolioId: String(b._id), strategy: String(b.strategy ?? "") }));
  // Pointing at a block that does not exist falls back to all (rather than a blank page from a stale link).
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

  // Prices are queried for the last year. **The initially visible window is still 90 days on desktop and 30 on mobile**
  // (the dataZoom below), and enough data has to be passed for a drag to reach a year (#133).
  // The SMA60 warm-up comes along naturally. Only one selected symbol is rendered, so the cost is small.
  // date is a "YYYY-MM-DD" string, so a lexical comparison ($gte) matches date order.
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
  // Index and leveraged ETFs absent from stocks (069500 = KODEX 200, say) are filled in from ETF_NAMES - a DB name wins.
  for (const tk of tickers) if (!names[tk] && ETF_NAMES[tk]) names[tk] = ETF_NAMES[tk];

  // With a block selected it shows that block's snapshot, otherwise the account's (#374).
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

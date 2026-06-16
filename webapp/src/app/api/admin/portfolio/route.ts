import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import PortfolioHistory from "@/models/portfolio-history";
import StockTrade from "@/models/stock-trade";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/portfolio?env=paper&currency=KRW
 *
 * 반환:
 *   {
 *     env, currency,
 *     history: [{ dateStr, totalValue, cash, holdingsValue, cumulativePnl }],
 *     tradesByDate: { "2026-06-15": { buy: N, sell: M, buyAmount, sellAmount } }
 *   }
 *
 * 같은 dateStr 에 여러 사이클 history 가 있으면 *마지막* (가장 늦은 ISO date) 만 사용.
 */
export async function GET(req: NextRequest) {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) return guard;

  const envParam = req.nextUrl.searchParams.get("env");
  const env = envParam === "real" ? "real" : "paper";
  const currency = req.nextUrl.searchParams.get("currency") ?? "KRW";

  await connectToDB();
  const histDocs = await PortfolioHistory.find({ env, currency })
    .select({ date: 1, dateStr: 1, totalValue: 1, cash: 1, holdingsValue: 1, cumulativePnl: 1, _id: 0 })
    .sort({ date: 1 })
    .lean();

  // 같은 dateStr 의 중복 entry → 마지막 ISO date 의 record 만 채택
  const byDate = new Map<string, typeof histDocs[number]>();
  for (const h of histDocs) byDate.set(h.dateStr, h);
  const history = Array.from(byDate.values()).map((h) => ({
    dateStr: h.dateStr,
    totalValue: h.totalValue,
    cash: h.cash,
    holdingsValue: h.holdingsValue,
    cumulativePnl: h.cumulativePnl,
  }));

  // 같은 env 의 매매 — 통화별 join (KRW 사이트와 USD 거래 분리)
  const trades = await StockTrade.find({
    env,
    currency,
  })
    .select({ ticker: 1, action: 1, amount: 1, price: 1, qty: 1, date: 1, _id: 0 })
    .lean();

  const tradesByDate: Record<
    string,
    {
      buy: number;
      sell: number;
      buyAmount: number;
      sellAmount: number;
      buyTickers: string[];
      sellTickers: string[];
    }
  > = {};
  for (const t of trades) {
    const slot =
      tradesByDate[t.date] ??
      (tradesByDate[t.date] = {
        buy: 0,
        sell: 0,
        buyAmount: 0,
        sellAmount: 0,
        buyTickers: [],
        sellTickers: [],
      });
    const amt = t.amount || (t.price ?? 0) * (t.qty ?? 0);
    if (t.action === "buy") {
      slot.buy++;
      slot.buyAmount += amt;
      if (!slot.buyTickers.includes(t.ticker)) slot.buyTickers.push(t.ticker);
    } else if (t.action === "sell") {
      slot.sell++;
      slot.sellAmount += amt;
      if (!slot.sellTickers.includes(t.ticker)) slot.sellTickers.push(t.ticker);
    }
  }

  return NextResponse.json({ env, currency, history, tradesByDate });
}

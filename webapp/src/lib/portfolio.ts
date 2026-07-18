import { connectToDB } from "@/lib/db";
import PortfolioHistory from "@/models/portfolio-history";
import StockTrade from "@/models/stock-trade";

// 멀티 포트폴리오: env 는 "paper" | "real" | "{env}-{계좌명}" (예: paper-main, paper-sub)
export type Env = string;

/** DB 에 존재하는 env 목록(포트폴리오 ∪ 매매기록) — 탭을 동적으로 만든다. */
export async function listEnvs(): Promise<string[]> {
  await connectToDB();
  const [a, b] = await Promise.all([
    PortfolioHistory.distinct("env", { hidden: { $ne: true } }),
    StockTrade.distinct("env", { hidden: { $ne: true } }),
  ]);
  const set = new Set<string>([...a, ...b].filter(Boolean));
  return [...set].sort();
}

/** 탭용 (env, currency) 조합 — 숨김 아닌 기록이 실제로 있는 것만. 포트폴리오·통화를 삭제(숨김)
 *  하면 그 조합 탭이 사라진다(빈 통화 탭이 남지 않게). PortfolioHistory ∪ StockTrade. */
export async function listEnvCurrencies(): Promise<{ env: string; currency: Currency }[]> {
  await connectToDB();
  const grp = (m: typeof PortfolioHistory | typeof StockTrade) =>
    m.aggregate<{ _id: { env: string; currency: string } }>([
      { $match: { hidden: { $ne: true } } },
      { $group: { _id: { env: "$env", currency: "$currency" } } },
    ]);
  const [a, b] = await Promise.all([grp(PortfolioHistory), grp(StockTrade)]);
  const map = new Map<string, { env: string; currency: Currency }>();
  for (const r of [...a, ...b]) {
    const env = r._id?.env;
    const currency = r._id?.currency;
    if (env && (currency === "KRW" || currency === "USD")) {
      map.set(`${env}|${currency}`, { env, currency });
    }
  }
  return [...map.values()].sort((x, y) =>
    x.env === y.env ? (x.currency < y.currency ? -1 : 1) : x.env < y.env ? -1 : 1);
}
export type Currency = "KRW" | "USD";

export type HistoryPoint = {
  dateStr: string;
  totalValue: number;
  cash: number;
  holdingsValue: number;
  cumulativePnl: number;
};

export type TradeStats = {
  buy: number;
  sell: number;
  buyAmount: number;
  sellAmount: number;
  buyTickers: string[];
  sellTickers: string[];
};

export type PortfolioData = {
  env: Env;
  currency: Currency;
  history: HistoryPoint[];
  tradesByDate: Record<string, TradeStats>;
};

type HistDoc = HistoryPoint & Record<string, unknown>;
type TradeDoc = {
  ticker: string;
  action?: string;
  amount?: number;
  price?: number;
  qty?: number;
  date: string;
};

/** 같은 dateStr 의 중복 history entry 는 마지막(가장 늦게 온) record 만 채택한다(순수). */
export function dedupeHistory(histDocs: HistDoc[]): HistoryPoint[] {
  const byDate = new Map<string, HistDoc>();
  for (const h of histDocs) byDate.set(h.dateStr, h);
  return Array.from(byDate.values()).map((h) => ({
    dateStr: h.dateStr,
    totalValue: h.totalValue,
    cash: h.cash,
    holdingsValue: h.holdingsValue,
    cumulativePnl: h.cumulativePnl,
  }));
}

/** 매매 배열 → 날짜별 buy/sell 건수·금액·티커(중복 제거) 집계(순수). */
export function aggregateTradesByDate(trades: TradeDoc[]): Record<string, TradeStats> {
  const tradesByDate: Record<string, TradeStats> = {};
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
  return tradesByDate;
}

/**
 * (env, currency) 포트폴리오 데이터 조회 — API route 와 server component(SSR 초기 로드)가 공유.
 * connectToDB + PortfolioHistory/StockTrade 조회 후 순수 집계로 조립한다.
 */
export async function getPortfolioData(env: Env, currency: Currency): Promise<PortfolioData> {
  await connectToDB();
  const histDocs = await PortfolioHistory.find({ env, currency, hidden: { $ne: true } })
    .select({ date: 1, dateStr: 1, totalValue: 1, cash: 1, holdingsValue: 1, cumulativePnl: 1, _id: 0 })
    .sort({ date: 1 })
    .lean();
  const trades = await StockTrade.find({ env, currency, hidden: { $ne: true } })
    .select({ ticker: 1, action: 1, amount: 1, price: 1, qty: 1, date: 1, _id: 0 })
    .lean();

  return {
    env,
    currency,
    history: dedupeHistory(histDocs as unknown as HistDoc[]),
    tradesByDate: aggregateTradesByDate(trades as unknown as TradeDoc[]),
  };
}

import { connectToDB } from "@/lib/db";
import PortfolioHistory from "@/models/portfolio-history";
import StockTrade from "@/models/stock-trade";
import TradingPortfolio from "@/models/trading-portfolio";
import TradingAccount from "@/models/trading-account";

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

/** 탭용 (env, currency) 조합 — ① 살아있는 포트폴리오(매매 전이라 기록이 없어도 탭은 나오게)
 *  ∪ ② 숨김 아닌 기록이 실제 있는 조합. 삭제한 포트폴리오(+숨긴 기록)만 탭에서 사라진다. */
export async function listEnvCurrencies(): Promise<{ env: string; currency: Currency }[]> {
  await connectToDB();
  const map = new Map<string, { env: string; currency: Currency }>();

  // ① 살아있는 포트폴리오 → (계정 envKey, market→통화). 매매 전이어도 탭 표시.
  const ports = await TradingPortfolio.find({ isDeleted: { $ne: true } })
    .select({ accountId: 1, market: 1 }).lean();
  if (ports.length) {
    const accts = await TradingAccount.find({
      _id: { $in: ports.map((p) => p.accountId) }, isDeleted: { $ne: true },
    }).select({ envKey: 1 }).lean();
    const envKeyOf = new Map(accts.map((a) => [String(a._id), a.envKey as string]));
    for (const p of ports) {
      const env = envKeyOf.get(String(p.accountId));
      const currency: Currency = p.market === "kr" ? "KRW" : "USD";
      if (env) map.set(`${env}|${currency}`, { env, currency });
    }
  }

  // ② 숨김 아닌 기록 기반(포트폴리오가 없어도 과거 기록이 있으면 탭 유지).
  const grp = (m: typeof PortfolioHistory | typeof StockTrade) =>
    m.aggregate<{ _id: { env: string; currency: string } }>([
      { $match: { hidden: { $ne: true } } },
      { $group: { _id: { env: "$env", currency: "$currency" } } },
    ]);
  const [a, b] = await Promise.all([grp(PortfolioHistory), grp(StockTrade)]);
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

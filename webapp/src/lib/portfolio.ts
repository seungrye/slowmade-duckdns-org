import { connectToDB } from "@/lib/db";
import PortfolioHistory from "@/models/portfolio-history";
import StockTrade from "@/models/stock-trade";
import TradingPortfolio from "@/models/trading-portfolio";
import TradingAccount from "@/models/trading-account";

// Multi-portfolio: env is "paper" | "real" | "{env}-{account name}" (paper-main, paper-sub and so on)
export type Env = string;

/** The envs present in the DB (portfolios and trades) - the tabs are built from this. */
export async function listEnvs(): Promise<string[]> {
  await connectToDB();
  const [a, b] = await Promise.all([
    PortfolioHistory.distinct("env", { hidden: { $ne: true } }),
    StockTrade.distinct("env", { hidden: { $ne: true } }),
  ]);
  const set = new Set<string>([...a, ...b].filter(Boolean));
  return [...set].sort();
}

/** The (env, currency) pairs for the tabs - from the live (undeleted) portfolios. The account envKey x market -> currency.
 *  Creating a portfolio creates a tab (even before any trading), and deleting it removes the tab. */
export async function listEnvCurrencies(): Promise<{ env: string; currency: Currency }[]> {
  await connectToDB();
  const ports = await TradingPortfolio.find({ isDeleted: { $ne: true } })
    .select({ accountId: 1, market: 1 }).lean();
  if (!ports.length) return [];
  const accts = await TradingAccount.find({
    _id: { $in: ports.map((p) => p.accountId) }, isDeleted: { $ne: true },
  }).select({ envKey: 1 }).lean();
  const envKeyOf = new Map(accts.map((a) => [String(a._id), a.envKey as string]));
  const map = new Map<string, { env: string; currency: Currency }>();
  for (const p of ports) {
    const env = envKeyOf.get(String(p.accountId));
    const currency: Currency = p.market === "kr" ? "KRW" : "USD";
    if (env) map.set(`${env}|${currency}`, { env, currency });
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
  /**
   * A row reconstructed from trades and daily bars (#373). Its cash, total assets and cumulative P&L are **unknown**,
   * so the UI must show `—` rather than a number. Only the holdings value can be reconstructed.
   */
  backfilled?: boolean;
};

export type TradeStats = {
  buy: number;
  sell: number;
  buyAmount: number;
  sellAmount: number;
  buyTickers: string[];
  sellTickers: string[];
};

/** One block's (strategy's) asset curve (#367, #373). */
export type BlockSeries = {
  portfolioId: string;
  strategy: string;
  history: HistoryPoint[];
  /** Only the trades attributed to that block (#372, #373). The markers go on the block's line. */
  tradesByDate: Record<string, TradeStats>;
};

export type PortfolioData = {
  env: Env;
  currency: Currency;
  history: HistoryPoint[];
  /** One line per block when an account and market hold several (#367). With only one, an empty array is fine. */
  blocks: BlockSeries[];
  /** **Every** trade for that (env, currency). Used for the summary and when there is only one block. */
  tradesByDate: Record<string, TradeStats>;
  /**
   * Only the trades attached to no block (#373). When markers go on the block lines, only these stay on the account
   * line - otherwise the same trade is marked twice, on the account line and the block line.
   */
  unownedTradesByDate: Record<string, TradeStats>;
};

type HistDoc = HistoryPoint & Record<string, unknown>;
type BlockDoc = HistDoc & { portfolioId: unknown; strategy?: string; backfilled?: boolean };

/**
 * Groups the block rows by block (pure). Same-day duplicates keep only the last, as the account rows do.
 *
 * With only one block there is no reason to draw another line, but that judgement belongs to the UI -
 * filtering it out here would mean hunting through the code again for "why is it not showing".
 */
export function groupBlocks(
  docs: BlockDoc[],
  tradesByBlock: Record<string, Record<string, TradeStats>> = {},
): BlockSeries[] {
  const by = new Map<string, BlockDoc[]>();
  for (const d of docs) {
    const id = String(d.portfolioId);
    (by.get(id) ?? by.set(id, []).get(id)!).push(d);
  }
  return [...by.entries()].map(([portfolioId, rows]) => ({
    portfolioId,
    // A backfilled row carries strategy too, but a live row is the more recent one when both exist.
    strategy: rows.map((r) => r.strategy).filter(Boolean).pop() ?? "",
    history: dedupeHistory(rows),
    tradesByDate: tradesByBlock[portfolioId] ?? {},
  }));
}
type TradeDoc = {
  portfolioId?: unknown;
  ticker: string;
  action?: string;
  amount?: number;
  price?: number;
  qty?: number;
  date: string;
};

/** Duplicate history entries on the same dateStr keep only the last (latest-arriving) record (pure). */
export function dedupeHistory(histDocs: HistDoc[]): HistoryPoint[] {
  const byDate = new Map<string, HistDoc>();
  for (const h of histDocs) byDate.set(h.dateStr, h);
  return Array.from(byDate.values()).map((h) => ({
    dateStr: h.dateStr,
    totalValue: h.totalValue,
    cash: h.cash,
    holdingsValue: h.holdingsValue,
    cumulativePnl: h.cumulativePnl,
    ...(h.backfilled ? { backfilled: true } : {}),
  }));
}

/**
 * Splits the trades by block (pure) - those with an attribution (#372) and those without.
 *
 * Ownerless trades are not discarded. The records of retired strategies (trend_v1, rotation_v1) are in there, and
 * they were real trades too - they stay on the account line.
 */
export function splitTradesByBlock(trades: TradeDoc[]): {
  byBlock: Record<string, TradeDoc[]>;
  unowned: TradeDoc[];
} {
  const byBlock: Record<string, TradeDoc[]> = {};
  const unowned: TradeDoc[] = [];
  for (const t of trades) {
    const id = t.portfolioId ? String(t.portfolioId) : "";
    if (id) (byBlock[id] ??= []).push(t);
    else unowned.push(t);
  }
  return { byBlock, unowned };
}

/** A trade array -> per-date buy/sell counts, amounts and tickers (deduplicated), aggregated (pure). */
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
 * Fetches a (env, currency) portfolio's data - shared by the API route and the server component (the SSR initial load).
 * It connects to the DB, queries PortfolioHistory and StockTrade, and assembles the result with pure aggregation.
 */
export async function getPortfolioData(env: Env, currency: Currency): Promise<PortfolioData> {
  await connectToDB();
  // Account rows only (#367) - a block row has a portfolioId. Older documents without one also match here.
  const histDocs = await PortfolioHistory.find({
    env, currency, hidden: { $ne: true }, portfolioId: null,
  })
    .select({ date: 1, dateStr: 1, totalValue: 1, cash: 1, holdingsValue: 1, cumulativePnl: 1, _id: 0 })
    .sort({ date: 1 })
    .lean();
  // Block rows - one line drawn per block.
  const blockDocs = await PortfolioHistory.find({
    env, currency, hidden: { $ne: true }, portfolioId: { $ne: null },
  })
    .select({ date: 1, dateStr: 1, totalValue: 1, cash: 1, holdingsValue: 1, portfolioId: 1, strategy: 1, backfilled: 1, _id: 0 })
    .sort({ date: 1 })
    .lean();
  const trades = await StockTrade.find({ env, currency, hidden: { $ne: true } })
    .select({ ticker: 1, action: 1, amount: 1, price: 1, qty: 1, date: 1, portfolioId: 1, _id: 0 })
    .lean();
  const all = trades as unknown as TradeDoc[];
  // A trade attributed to a block (#372) is marked on that block's line; an ownerless one on the account line.
  const 블록별 = splitTradesByBlock(all);
  const 블록집계: Record<string, Record<string, TradeStats>> = {};
  for (const [id, rows] of Object.entries(블록별.byBlock)) {
    블록집계[id] = aggregateTradesByDate(rows);
  }

  return {
    env,
    currency,
    history: dedupeHistory(histDocs as unknown as HistDoc[]),
    blocks: groupBlocks(blockDocs as unknown as BlockDoc[], 블록집계),
    tradesByDate: aggregateTradesByDate(all),
    unownedTradesByDate: aggregateTradesByDate(블록별.unowned),
  };
}

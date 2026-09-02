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

/** 탭용 (env, currency) 조합 — 살아있는(삭제 안 된) 포트폴리오 기준. 계정 envKey × market→통화.
 *  포트폴리오를 만들면(매매 전이어도) 탭이 생기고, 삭제하면 탭이 사라진다. */
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
   * 매매기록·일봉으로 되살린 행 (#373). 이 행의 현금·총재산·누적손익은 **모르는 값**이라
   * 화면이 숫자 대신 `—` 로 보여야 한다. 되살릴 수 있는 건 보유 평가액뿐이다.
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

/** 블록(전략) 하나의 자산 곡선 (#367·#373). */
export type BlockSeries = {
  portfolioId: string;
  strategy: string;
  history: HistoryPoint[];
  /** 그 블록에 귀속된 매매만 (#372·#373). 마커를 블록 선 위에 찍는다. */
  tradesByDate: Record<string, TradeStats>;
};

export type PortfolioData = {
  env: Env;
  currency: Currency;
  history: HistoryPoint[];
  /** 계정·시장에 블록이 여럿일 때 블록마다 한 줄 (#367). 하나뿐이면 빈 배열이어도 무방. */
  blocks: BlockSeries[];
  /** 그 (env,currency)의 **모든** 매매 집계. 블록이 하나뿐일 때·요약에 쓴다. */
  tradesByDate: Record<string, TradeStats>;
  /**
   * 어느 블록에도 안 붙은 매매만 (#373). 블록 선 위에 마커를 찍을 때, 이것만 계좌 선에
   * 남긴다 — 안 그러면 같은 매매가 계좌 선과 블록 선에 두 번 찍힌다.
   */
  unownedTradesByDate: Record<string, TradeStats>;
};

type HistDoc = HistoryPoint & Record<string, unknown>;
type BlockDoc = HistDoc & { portfolioId: unknown; strategy?: string; backfilled?: boolean };

/**
 * 블록 행을 블록별로 묶는다(순수). 같은 날 중복은 계좌 행과 같은 규칙으로 마지막 것만.
 *
 * 블록이 하나뿐이면 굳이 선을 더 그릴 이유가 없지만, 그 판단은 화면이 한다 —
 * 여기서 걸러 버리면 "왜 안 보이지" 를 또 코드에서 찾아야 한다.
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
    // 백필 행에는 strategy 를 같이 넣지만, 라이브 행이 있으면 그쪽이 최신이다.
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
    ...(h.backfilled ? { backfilled: true } : {}),
  }));
}

/**
 * 매매를 블록별로 가른다(순수) — 귀속(#372)이 붙은 것과 안 붙은 것.
 *
 * 주인 없는 매매는 버리지 않는다. 폐기된 전략(trend_v1·rotation_v1)의 기록이 거기 있고,
 * 그것도 실제로 있었던 매매다 — 계좌 선 위에 남는다.
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
  // 계좌 행만 (#367) — 블록 행은 portfolioId 가 있다. 없는 옛 문서도 여기 걸린다.
  const histDocs = await PortfolioHistory.find({
    env, currency, hidden: { $ne: true }, portfolioId: null,
  })
    .select({ date: 1, dateStr: 1, totalValue: 1, cash: 1, holdingsValue: 1, cumulativePnl: 1, _id: 0 })
    .sort({ date: 1 })
    .lean();
  // 블록 행 — 블록마다 한 줄씩 그린다.
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
  // 블록에 귀속된 매매(#372)는 그 블록 선 위에, 주인 없는 매매는 계좌 선 위에 찍는다.
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

import { connectToDB } from "@/lib/db";
import PortfolioHistory from "@/models/portfolio-history";
// ⚠ close-sync 를 import 하면 mongoose 모델·KIS 클라이언트·mailer 가 페이지 그래프로 끌려온다.
import { cumAsOf, reconcileBooks, walkBooks } from "@/lib/trading/pnl-walk";
import StockTrade from "@/models/stock-trade";
import TradingPortfolio from "@/models/trading-portfolio";
import TradingAccount from "@/models/trading-account";
import { buildTabs, type Tab } from "@/lib/portfolio-tabs";

// 멀티 포트폴리오: env 는 계정의 envKey — "{paper|real}-{계좌번호}"(예: paper-50194613).
// 옛 단일계정 기록은 "paper"/"real" 도 있을 수 있어 좁히지 않는다.
export type Env = string;
export type { Tab };

/**
 * 탭용 (env, currency) 조합 — **살아있는 블록 ∪ 기록이 있는 조합** (#515).
 *
 * 예전엔 살아있는 포트폴리오만 봤다. 그래서 블록을 다른 계좌로 옮기면 옛 계좌 탭이 통째로
 * 사라졌다 — 매매기록 300건·이력 275건이 DB 에 그대로 있는데 볼 방법이 없어진다.
 * 기록이 있는 조합은 `archived: true` 로 남겨 계속 볼 수 있게 한다.
 *
 * 합치는 규칙은 `portfolio-tabs.buildTabs`(순수, 테스트 있음)가 정한다. 여기는 조회만.
 * (예전의 `listEnvs()` 는 이 데이터 소스를 이미 갖고 있었지만 아무도 안 썼다 — 걷어냈다.)
 */
export async function listEnvCurrencies(): Promise<Tab[]> {
  await connectToDB();
  const [ports, histPairs] = await Promise.all([
    TradingPortfolio.find({ isDeleted: { $ne: true } }).select({ accountId: 1, market: 1 }).lean(),
    // 기록이 있는 (env, currency) — 차트는 이력 위에 그리므로 이력이 기준이다.
    PortfolioHistory.aggregate<{ _id: { env: string; currency: Currency } }>([
      { $match: { hidden: { $ne: true } } },
      { $group: { _id: { env: "$env", currency: "$currency" } } },
    ]),
  ]);

  const accts = ports.length
    ? await TradingAccount.find({
        _id: { $in: ports.map((p) => p.accountId) }, isDeleted: { $ne: true },
      }).select({ envKey: 1 }).lean()
    : [];
  const envKeyOf = new Map(accts.map((a) => [String(a._id), a.envKey as string]));

  const live: { env: string; currency: Currency }[] = [];
  for (const p of ports) {
    const env = envKeyOf.get(String(p.accountId));
    if (env) live.push({ env, currency: p.market === "kr" ? "KRW" : "USD" });
  }
  const withData = histPairs
    .map((h) => ({ env: h._id?.env, currency: h._id?.currency }))
    .filter((h): h is { env: string; currency: Currency } =>
      Boolean(h.env) && (h.currency === "KRW" || h.currency === "USD"));

  return buildTabs(live, withData);
}
export type Currency = "KRW" | "USD";

export type HistoryPoint = {
  dateStr: string;
  totalValue: number;
  cash: number;
  holdingsValue: number;
  cumulativePnl: number;
  /** 그 날짜까지의 **귀속** 실현손익 (#505). 블록 시리즈에만 붙는다. */
  attributedCumPnl?: number;
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
  /** 귀속 실현손익 — 원장에서 파생한다(저장 안 함). 계좌 탭의 「누적 손익」과 **다른 정의**다. */
  attributedCum?: number;
  /** 원가를 모르는 매도. 있으면 그 블록 숫자가 실제보다 유리/불리하게 보인다 */
  unknownCost?: string[];
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
  /** 블록 손익 분해 검사 (#505). */
  pnlBreakdown?: {
    residual: number; reasons: string[]; unattributedCum: number; pooledCum: number;
  };
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
  /** 블록별 원장 워크 (#505) — 손익은 저장하지 않고 여기서 파생해 실어 준다. */
  books: Record<string, { cum: number; cumByDate: Map<string, number>; unknownCost: string[] }> = {},
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
    // 저장된 cumulativePnl 은 블록 행에 **없다**(#382). 원장에서 파생한 값을 날짜마다 얹는다.
    history: dedupeHistory(rows).map((h) => ({
      ...h,
      attributedCumPnl: books[portfolioId]
        ? cumAsOf(books[portfolioId].cumByDate, h.dateStr) : undefined,
    })),
    tradesByDate: tradesByBlock[portfolioId] ?? {},
    attributedCum: books[portfolioId]?.cum,
    unknownCost: books[portfolioId]?.unknownCost ?? [],
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
    ...(h.attributedCumPnl !== undefined ? { attributedCumPnl: h.attributedCumPnl } : {}),
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
  // ⚠ `hidden` 을 **쿼리 조건으로 쓰지 않는다** (#505). hidden 은 표시 설정인데 회계 원장에서
  //   거르면 블록 하나를 숨기는 순간 손익이 튄다(실측: pooled −2,238 → −5,012, 무주는 2,815 이동).
  //   #500 이 가르친 병과 같다 — 집합이 바뀌면 누적이 바뀐다. 그래서 전량을 읽고
  //   **표시 집계에서만** 메모리로 거른다.
  const tradeDocs = await StockTrade.find({ env, currency })
    .select({ ticker: 1, action: 1, amount: 1, price: 1, qty: 1, date: 1, time: 1,
              portfolioId: 1, hidden: 1, _id: 0 })
    .lean();
  const ledgerRows = tradeDocs as unknown as (TradeDoc & {
    time?: string; hidden?: boolean; price?: number; qty?: number;
  })[];
  const all = ledgerRows.filter((t) => !t.hidden) as TradeDoc[];
  // 블록에 귀속된 매매(#372)는 그 블록 선 위에, 주인 없는 매매는 계좌 선 위에 찍는다.
  const 블록별 = splitTradesByBlock(all);
  const 블록집계: Record<string, Record<string, TradeStats>> = {};
  for (const [id, rows] of Object.entries(블록별.byBlock)) {
    블록집계[id] = aggregateTradesByDate(rows);
  }

  // 블록별 누적손익은 **저장하지 않고 읽을 때 파생한다** (#505·#382).
  // 블록 행에 쓰면 `recalc-cumulative-pnl.mjs` 의 $unset 과 서로 반대로 쓰게 된다.
  const books = walkBooks(
    ledgerRows.map((t) => ({
      book: t.portfolioId ? String(t.portfolioId) : "",
      ticker: String(t.ticker), date: String(t.date),
      time: String(t.time ?? `${t.date}T00:00:00`),
      side: t.action === "sell" ? "sell" as const : "buy" as const,
      qty: Number(t.qty ?? 0), price: Number(t.price ?? 0), currency,
    })),
    histDocs.length ? String(histDocs[histDocs.length - 1].dateStr) : "",
  );
  const 분해 = reconcileBooks(books.books, books.pooled);

  return {
    env,
    currency,
    history: dedupeHistory(histDocs as unknown as HistDoc[]),
    blocks: groupBlocks(blockDocs as unknown as BlockDoc[], 블록집계, books.books),
    /** 블록 손익 분해가 닫히는지 (#505). 잔차 0 이어도 화면이 찍는다 — 정상 모양을 학습시켜야
     *  비정상이 눈에 걸린다. 무주 몫도 함께 준다(숨기면 블록 합만 보고 계좌를 오해한다). */
    pnlBreakdown: {
      residual: 분해.residual,
      reasons: 분해.reasons,
      unattributedCum: books.books[""]?.cum ?? 0,
      pooledCum: books.pooled.cum,
    },
    tradesByDate: aggregateTradesByDate(all),
    unownedTradesByDate: aggregateTradesByDate(블록별.unowned),
  };
}

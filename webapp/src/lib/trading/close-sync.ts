// The post-close cycle (close sync), porting the Python daemon's 16:10 close sync to the site.
//
// 1) Prices: the last 30 daily bars for (syncUniverse and holdings) -> upsert into stockdailyprices (chart lines).
// 2) Trades: **based on KIS fills** (a port of Python's fills_to_trades_and_pnl) - only real fills,
//    not orders (unfilled limit/LOC excluded; partial fills merged, realized P&L against the average price).
//    Symbols queried = portfolio targets and holdings (querying every symbol is impossible under the rate limit - Python's positions approach).
// 3) Portfolio snapshot: totalValue = cash + sum(holding x current price) -> upsert into portfoliohistories.
// 4) Mail: one a day - holdings value, today's fills and realized P&L, with the progress log attached.
// Collections use collection-level upserts exactly like the ingest API (the same key space as Python's push).

import StockDailyPrice from "@/models/stock-daily-price";
import StockTrade from "@/models/stock-trade";
import PortfolioHistory from "@/models/portfolio-history";
import { blockSnapshot } from "./block-snapshot";
import TradingOrderLog from "@/models/trading-order-log";
import type { Types } from "mongoose";
import { KisClient, usQuoteExcd, registerUsExcd } from "./kis-client";
import { makeKisClient, makeTossClient, marketToday } from "./engines";
import type { CycleLogger } from "./engines";
import { TossClient } from "./toss-client";
import { sendTradingMail } from "./mailer";
import { UNIVERSES, EXCD_MAPS } from "./universes";
import { buildTradeUpsertOp } from "./trade-upsert";
import TradingPortfolio from "@/models/trading-portfolio";
import { ownerLookup, contestedSymbols, type AttributionBlock, type FillOwner } from "./fill-attribution";
import { formatMoney } from "@/lib/format";

type Json = Record<string, unknown>;
type Fill = {
  ticker: string; date: string; time: string; side: "buy" | "sell";
  qty: number; price: number; currency: string;
};

// How many recent fills to re-push each close. Generous enough to cover the whole 90 days queried - it costs
// nothing, since no extra API calls are made, and block attribution (#372) then corrects older records in that window too.
const RECENT_TRADES = 500;
// The fill query range. **Unrelated to the period the chart shows** - trades, daily bars and snapshots all live
// in our own DB, and this query only picks up fills since the last sync. Widening it just re-fetches what we
// already have, and KRX's inquire-daily-ccld caps the query at 3 months anyway.
const LOOKBACK_DAYS = 90;
// If the share of failed price lookups exceeds this, no snapshot is recorded (so a partial valuation is not
// persisted as total assets on a holiday or during a major outage). Fewer failures are absorbed by falling back to the average price.
const MAX_FAIL_RATIO = 0.3;

/** Holdings valuation (pure) - a symbol whose price lookup failed falls back to its average price (cost),
 *  so it is not dropped from the valuation. A valid price is non-null, finite and positive. **0 and NaN also
 *  count as failures** (so a rate-limited usPrice returning 0 or empty cannot collapse total assets to zero -
 *  the cause of the 07-14 collapse). */
export function valueHoldings(
  holdings: Record<string, [number, number]>,
  priceOf: (sym: string) => number | null,
): { hv: number; failed: string[]; failRatio: number; rows: [string, number, number, number][] } {
  let hv = 0;
  const failed: string[] = [];
  const rows: [string, number, number, number][] = [];
  const entries = Object.entries(holdings);
  for (const [sym, [qty, avg]] of entries) {
    const live = priceOf(sym);
    const ok = live != null && Number.isFinite(live) && live > 0;
    const price = ok ? live : avg; // fallback = acquisition cost
    if (!ok) failed.push(sym);
    hv += qty * price;
    rows.push([sym, qty, avg, price]);
  }
  return { hv, failed, failRatio: entries.length ? failed.length / entries.length : 0, rows };
}

// -- Ported from Python's site_sync._parse_fill / fills_to_trades_and_pnl --

export function parseFill(f: Json): Fill | null {
  const dateRaw = String(f.ord_dt ?? f.dmst_ord_dt ?? "").trim();
  const side = { "02": "buy", "01": "sell" }[String(f.sll_buy_dvsn_cd ?? "").trim()] as
    "buy" | "sell" | undefined;
  const ticker = f.pdno ? String(f.pdno) : "";
  if (dateRaw.length < 8 || !side || !ticker) return null;
  let qty = 0;
  for (const k of ["ft_ccld_qty", "ccld_qty", "tot_ccld_qty"]) {
    const v = f[k];
    if (v !== undefined && v !== "") {
      qty = Number(v);
      break;
    }
  }
  if (!(qty > 0)) return null; // fills only
  const price = Number(f.ft_ccld_unpr3 ?? f.ft_ccld_unpr ?? f.avg_prvs ?? 0);
  const tmd = String(f.ord_tmd ?? f.thco_ord_tmd ?? "000000").trim().padStart(6, "0").slice(0, 6);
  const d = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
  return {
    ticker, date: d,
    time: `${d}T${tmd.slice(0, 2)}:${tmd.slice(2, 4)}:${tmd.slice(4, 6)}`,
    side, qty, price,
    currency: String(f.tr_crcy_cd ?? "").trim(),
  };
}

export function fillsToTradesAndPnl(
  fills: Fill[],
  opts: {
    env: string; market: "kr" | "us"; today: string;
    /**
     * Symbol -> the block that produced the fill (#372). This used to carry `strategy: portfolio.strategy`,
     * which **tagged every account-wide fill with that one strategy** - once there were two blocks, whichever
     * ran first claimed them all. Now only fills with a clear owner get a tag.
     */
    owner: (ticker: string, date: string) => FillOwner | null;
  },
): { records: Json[]; run: number; cum: number } {
  const defaultCur = opts.market === "kr" ? "KRW" : "USD";
  // merge partial fills sharing (symbol, time, side) at a weighted average
  const agg = new Map<string, Fill & { amount: number }>();
  for (const p of fills) {
    const key = `${p.ticker}|${p.time}|${p.side}`;
    const a = agg.get(key);
    if (!a) agg.set(key, { ...p, amount: p.qty * p.price });
    else {
      a.qty += p.qty;
      a.amount += p.qty * p.price;
    }
  }
  const rows = [...agg.values()].sort((x, y) =>
    x.date === y.date ? (x.time < y.time ? -1 : 1) : x.date < y.date ? -1 : 1);

  const pos = new Map<string, [number, number]>(); // ticker -> [qty, cost]
  let run = 0, cum = 0;
  const enriched: { r: Fill & { amount: number }; cumQty: number; price: number }[] = [];
  for (const r of rows) {
    const price = r.qty ? r.amount / r.qty : 0;
    const st = pos.get(r.ticker) ?? [0, 0];
    if (r.side === "buy") {
      st[0] += r.qty;
      st[1] += r.qty * price;
    } else {
      const avg = st[0] > 0 ? st[1] / st[0] : 0;
      const pnl = (price - avg) * r.qty;
      cum += pnl;
      if (r.date === opts.today) run += pnl;
      st[0] = Math.max(0, st[0] - r.qty);
      st[1] = Math.max(0, st[1] - avg * r.qty);
    }
    pos.set(r.ticker, st);
    enriched.push({ r, cumQty: st[0], price });
  }
  const recent = enriched.slice(-RECENT_TRADES);
  const records = recent.map(({ r, cumQty, price }) => {
    // With no owner (a liquidation from an old universe, or an overlapping symbol) the record is kept untagged.
    // buildTradeUpsertOp filters out undefined so no empty value is written.
    const own = opts.owner(r.ticker, r.date);
    return {
    env: opts.env, ticker: r.ticker, action: r.side,
    ...(own ? { strategy: own.strategy, portfolioId: own.id } : {}),
    qty: r.qty, cumulativeQty: cumQty,
    price: Math.round(price * 10000) / 10000,
    amount: Math.round(r.amount * 10000) / 10000,
    currency: r.currency || defaultCur,
    date: r.date, time: r.time,
    };
  });
  return { records, run, cum };
}

// -- Upsert helpers (the same keys as the ingest API) --------------

async function upsertPrices(records: Json[]): Promise<number> {
  if (!records.length) return 0;
  const ops = records.map((r) => ({
    updateOne: {
      filter: { ticker: r.ticker, date: r.date },
      update: { $set: r, $currentDate: { updatedAt: true } },
      upsert: true,
    },
  }));
  const res = await StockDailyPrice.collection.bulkWrite(ops as never[], { ordered: false });
  return (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0);
}

async function upsertTrades(records: Json[]): Promise<number> {
  if (!records.length) return 0;
  // strategy alone goes through $setOnInsert, so a re-push never overwrites an older record's strategy tag (#77).
  // The assembly rules live in trade-upsert.ts (pure functions, with tests).
  const ops = records.map(buildTradeUpsertOp);
  const res = await StockTrade.collection.bulkWrite(ops as never[], { ordered: false });
  return (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0);
}

// -- The close cycle itself ------------------------------------

type AccountDoc = {
  _id: Types.ObjectId; broker: string; envKey: string;
  credentials: unknown; env: string; liveEnabled?: boolean | null;
};
type PortfolioDoc = {
  _id: Types.ObjectId; market: string; strategy: string; config: unknown;
  /** The block snapshot reads its own cash ledger (#367). The scheduler reads it with lean() and no select. */
  state?: unknown;
  /** The floor for fill attribution (#372). Fills before this date are not this block's. */
  createdAt?: Date;
};

export async function runCloseSync(
  account: AccountDoc, portfolio: PortfolioDoc, _runId: Types.ObjectId, log: CycleLogger,
): Promise<string> {
  const market = portfolio.market as "kr" | "us";
  const cfg = (portfolio.config ?? {}) as Json;
  const currency = market === "kr" ? "KRW" : "USD";
  const now = new Date();
  const todayKey = marketToday(market, now); // YYYYMMDD
  const today = `${todayKey.slice(0, 4)}-${todayKey.slice(4, 6)}-${todayKey.slice(6, 8)}`;

  const isToss = account.broker === "toss";
  const kis: KisClient | null = isToss ? null : makeKisClient(account as never);
  const toss: TossClient | null = isToss ? makeTossClient(account as never) : null;

  // Balance (holdings, cash, broker valuation)
  let holdings: Record<string, [number, number]> = {};
  let cash = 0;
  let hvBroker = 0; // The holdings valuation the broker's API gave us (we do not recompute from current prices)
  let balOk = true;
  try {
    [holdings, cash, hvBroker] = isToss
      ? await toss!.account(market)
      : market === "kr" ? await kis!.krAccount() : await kis!.usAccount();
  } catch (e) {
    balOk = false;
    log(`잔고 조회 실패 → 포트폴리오 스냅샷 생략: ${e instanceof Error ? e.message : e}`);
  }

  // 1) Price push - syncUniverseRef (a named universe), syncUniverse (inline, for compatibility),
  //   config.universe and holdings. Large symbol lists live in universes.ts rather than the portfolio document.
  const refSyms = [
    ...(typeof cfg.syncUniverseRef === "string" ? (UNIVERSES[cfg.syncUniverseRef] ?? []) : []),
    ...(typeof cfg.universeRef === "string" ? (UNIVERSES[cfg.universeRef] ?? []) : []),
  ];
  const uni = new Set<string>([
    ...refSyms,
    ...(Array.isArray(cfg.syncUniverse) ? (cfg.syncUniverse as string[]) : []),
    ...(Array.isArray(cfg.universe) ? (cfg.universe as string[]) : []),
    ...(cfg.symbol ? [String(cfg.symbol)] : []),
    ...Object.keys(holdings),
  ]);
  // NYSE/AMEX daily bars must be queried with the right EXCD. registerUsExcd is only called from the trend
  // engine's trading cycle, and close-sync (the close cycle) runs separately, so the module registry is empty
  // there - every unregistered NYSE symbol was queried as the default NAS and returned 0 rows (the cause of the 07-14 NYSE price loss).
  // So the portfolio's excd mapping (universeRef or inline) is registered here too.
  if (market === "us" && !isToss) {
    const em =
      (typeof cfg.universeRef === "string" ? EXCD_MAPS[cfg.universeRef] : undefined) ??
      (typeof cfg.syncUniverseRef === "string" ? EXCD_MAPS[cfg.syncUniverseRef] : undefined) ??
      (cfg.excdMap && typeof cfg.excdMap === "object"
        ? (cfg.excdMap as Record<string, string>)
        : undefined);
    if (em) registerUsExcd(em);
  }
  let priceRecords = 0, priceSyms = 0;
  for (const sym of uni) {
    try {
      const rows = isToss
        ? (await toss!.historyLong(sym, 30)).map(([d, c]) => ({ date: d, close: c }))
        : market === "kr"
          ? await kis!.krOhlcvRecent(sym)
          : await kis!.usOhlcvRecent(sym, usQuoteExcd(sym));
      const recs = rows.slice(0, 30).map((r) => ({
        ticker: sym,
        date: `${String(r.date).slice(0, 4)}-${String(r.date).slice(4, 6)}-${String(r.date).slice(6, 8)}`,
        open: (r as Json).open ?? r.close, high: (r as Json).high ?? r.close,
        low: (r as Json).low ?? r.close, close: r.close,
        volume: (r as Json).volume ?? 0,
      }));
      priceRecords += await upsertPrices(recs as Json[]);
      priceSyms++;
    } catch (e) {
      log(`[${sym}] 일봉 조회 실패 — 스킵: ${e instanceof Error ? e.message : e}`);
    }
  }
  log(`가격 push: ${priceSyms}/${uni.size}종목 · ${priceRecords}행`);

  // 2) Trades and realized P&L - from the fills (target and holding symbols)
  const tradeSyms = new Set<string>([
    ...(cfg.symbol ? [String(cfg.symbol)] : []),
    ...(Array.isArray(cfg.candidates) ? (cfg.candidates as string[]) : []),
    ...(cfg.target ? [String(cfg.target)] : []),
    ...Object.keys(holdings),
  ]);
  let run = 0, cum = 0, tradeCount = 0;
  const start = new Date(now.getTime() - LOOKBACK_DAYS * 86400_000)
    .toISOString().slice(0, 10).replace(/-/g, "");
  const fills: Fill[] = [];
  if (isToss) {
    // Toss: with no closed-state fill query API, fills are gathered from the details (orderDetail) of the real
    // orders we logged (orderNo), the same way V4TossBroker does. The ticker comes from the order log's symbol.
    const since = new Date(now.getTime() - LOOKBACK_DAYS * 86400_000);
    const logs = await TradingOrderLog.find({
      accountId: account._id, dryRun: false, orderNo: { $ne: "" }, createdAt: { $gte: since },
    }).lean();
    const symOf = new Map<string, string>();
    for (const l of logs) if (l.orderNo) symOf.set(String(l.orderNo), String(l.symbol));
    for (const [orderNo, sym] of symOf) {
      try {
        const d = (await toss!.orderDetail(orderNo)) as Json;
        const ex = (d.execution ?? {}) as Json;
        const qty = Math.trunc(Number(ex.filledQuantity ?? 0));
        if (qty < 1) continue; // fills only
        const at = String(ex.filledAt ?? d.orderedAt ?? "");
        const date = at.slice(0, 10); // YYYY-MM-DD
        const dateKey = date.replace(/-/g, "");
        if (!dateKey || dateKey < start || dateKey > todayKey) continue;
        fills.push({
          ticker: sym, date,
          time: at.length >= 19 ? at.slice(0, 19) : `${date}T00:00:00`,
          side: String(d.side ?? "").toUpperCase() === "SELL" ? "sell" : "buy",
          qty, price: Number(ex.averageFilledPrice ?? d.price ?? 0), currency,
        });
      } catch {
        continue; // Isolate per order, so one failed query does not block the whole reconciliation
      }
    }
  } else if (market === "us") {
    // US: query every exchange at once. Querying per symbol as NASD missed fills on NYSE-listed holdings
    // and left realized P&L at 0, so it was replaced with an all-exchange query.
    try {
      for (const r of await kis!.usExecutionsAll(start, todayKey)) {
        const p = parseFill(r as Json);
        if (p) fills.push(p);
      }
    } catch (e) {
      log(`미장 체결내역 조회 실패 — 스킵: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    for (const sym of tradeSyms) {
      try {
        for (const r of await kis!.krExecutions(sym, start, todayKey)) {
          const p = parseFill(r as Json);
          if (p) fills.push(p);
        }
      } catch (e) {
        log(`[${sym}] 체결내역 조회 실패 — 스킵: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  // Fill attribution (#372) - judging "am I the only owner of this symbol?" needs the **sibling blocks** on the
  // same account and market. A block that looks only at its own symbols never notices an overlap.
  let siblings: AttributionBlock[] = [];
  try {
    const docs = await TradingPortfolio.find({
      accountId: account._id, market, isDeleted: { $ne: true },
    }).select({ strategy: 1, config: 1, createdAt: 1 }).lean();
    siblings = docs.map((d) => ({
      id: String(d._id), strategy: String(d.strategy ?? ""),
      config: (d.config ?? {}) as Record<string, unknown>,
      // Fills predating the block are not its own - the 90-day re-sweep would otherwise pull in an old strategy's trades.
      ...(d.createdAt ? { since: new Date(d.createdAt as Date).toISOString().slice(0, 10) } : {}),
    }));
  } catch (e) {
    // On a failed query it judges from its own block alone - fewer tags get attached, but none get attached wrongly.
    log(`형제 블록 조회 실패 — 자기 블록만으로 귀속: ${e instanceof Error ? e.message : e}`);
    siblings = [{
      id: String(portfolio._id), strategy: portfolio.strategy,
      config: (portfolio.config ?? {}) as Record<string, unknown>,
      ...(portfolio.createdAt ? { since: new Date(portfolio.createdAt).toISOString().slice(0, 10) } : {}),
    }];
  }
  const contested = contestedSymbols(siblings);
  if (contested.length) {
    log(`⚠ 두 블록이 함께 무는 종목 — 귀속 보류(계좌 귀속): ${contested.join(", ")}`);
  }
  const out = fillsToTradesAndPnl(fills, {
    env: account.envKey, market, today, owner: ownerLookup(siblings),
  });
  run = out.run;   // Fallback (avg-cost computed from the fills ourselves)
  cum = out.cum;
  tradeCount = await upsertTrades(out.records);
  // Realized P&L **prefers the broker's period-P&L API** (KIS live accounts); on failure (unsupported on paper) the calculation above stands.
  // Toss has no period-P&L API, so the run/cum values computed from the fills are used as is.
  if (!isToss) {
    try {
      const base = new Date(now.getTime() - 1825 * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
      cum = market === "kr" ? await kis!.krRealizedPnl(base, todayKey) : await kis!.usRealizedPnl(base, todayKey);
      run = market === "kr" ? await kis!.krRealizedPnl(todayKey, todayKey) : await kis!.usRealizedPnl(todayKey, todayKey);
      log(`실현손익: 증권사 기간손익 API 사용 (오늘 ${formatMoney(run, market)} · 누적 ${formatMoney(cum, market)})`);
    } catch (e) {
      log(`실현손익: 기간손익 API 미지원(모의 등) → 체결내역 자체계산 유지 (누적 ${formatMoney(cum, market)}): `
        + `${e instanceof Error ? e.message : e}`);
    }
  }
  log(`매매기록: ${tradeCount}건 upsert · 오늘 실현 ${formatMoney(run, market)} · 누적 ${formatMoney(cum, market)}`);

  // 3) Portfolio snapshot - holdings are valued with **the broker API's own valuation** (hvBroker) as is
  // (we do not re-query per-symbol prices and multiply, so a rate limit cannot collapse total assets).
  // Only when hvBroker is absent (Toss and the like) does the fallback compute it ourselves (cost substitution included).
  let evalRows: [string, number, number, number][] = []; // sym, qty, avg, price (for the mail)
  if (balOk) {
    let hv = hvBroker;
    let skip = false;
    if (!(hv > 0)) {
      const prices = new Map<string, number | null>();
      for (const [sym] of Object.entries(holdings)) {
        try {
          prices.set(sym, isToss
            ? await toss!.price(sym)
            : market === "kr" ? await kis!.krPrice(sym) : await kis!.usPrice(sym, usQuoteExcd(sym)));
        } catch (e) {
          prices.set(sym, null);
          log(`[${sym}] 현재가 실패 → 평단가 대체 평가: ${e instanceof Error ? e.message : e}`);
        }
      }
      const vh = valueHoldings(holdings, (sym) => prices.get(sym) ?? null);
      hv = vh.hv;
      evalRows = vh.rows;
      if (vh.failRatio > MAX_FAIL_RATIO) {
        log(`포트폴리오 스냅샷 스킵 — 현재가 실패 ${vh.failed.length}/${Object.keys(holdings).length}종목`
          + `(${Math.round(vh.failRatio * 100)}%): 휴장/장애 가능성, 오염값 기록 방지`);
        skip = true;
      } else if (vh.failed.length) {
        log(`포트폴리오 스냅샷(폴백): ${vh.failed.length}종목 평단가 대체(${vh.failed.join(",")})`);
      }
    } else {
      // Using the broker's valuation - the mail shows cost, since no separate price lookup happens
      evalRows = Object.entries(holdings).map(([s, [q, a]]) => [s, q, a, a]);
    }
    if (!skip) {
      await PortfolioHistory.collection.updateOne(
        { env: account.envKey, currency, date: now.toISOString() },
        { $set: {
            env: account.envKey, currency, date: now.toISOString(), dateStr: today,
            totalValue: Math.round((cash + hv) * 10000) / 10000,
            cash: Math.round(cash * 10000) / 10000,
            holdingsValue: Math.round(hv * 10000) / 10000,
            runPnl: Math.round(run * 10000) / 10000,
            cumulativePnl: Math.round(cum * 10000) / 10000,
          } },
        { upsert: true },
      );
      log(`포트폴리오 스냅샷: 현금 ${formatMoney(cash, market)} + 보유 ${formatMoney(hv, market)}`);

      // Block rows (#367) - an account row alone cannot tell two blocks on one account and market apart.
      // Record only what that block knows (a strategy with no ledger leaves cash empty).
      //
      // runPnl and cumulativePnl are **deliberately left out** (#382). The run/cum above are **account-level**
      //   values, from the broker's period-P&L API or the account's whole fill history, so putting them on a
      //   block row would have every block claim the entire account's P&L as its own. Per-block realized P&L
      //   would have to be computed from that block's attributed fills alone, which we do not do yet.
      //   The UI renders a missing value as `—` (filling in 0 would be a lie meaning "P&L is zero").
      const blk = blockSnapshot({
        strategy: portfolio.strategy,
        config: cfg as Record<string, unknown>,
        state: (portfolio.state ?? {}) as Record<string, unknown>,
        evalRows, hvBroker,
      });
      if (blk) {
        await PortfolioHistory.collection.updateOne(
          { env: account.envKey, currency, portfolioId: portfolio._id, date: now.toISOString() },
          { $set: {
              env: account.envKey, currency, portfolioId: portfolio._id,
              strategy: portfolio.strategy, date: now.toISOString(), dateStr: today,
              totalValue: Math.round(blk.totalValue * 10000) / 10000,
              cash: blk.cash === null ? 0 : Math.round(blk.cash * 10000) / 10000,
              holdingsValue: Math.round(blk.holdingsValue * 10000) / 10000,
            } },
          { upsert: true },
        );
        log(`  ↳ ${portfolio.strategy} 블록: 장부현금 ${blk.cash === null ? "(없음)" : formatMoney(blk.cash, market)}`
          + ` + 보유 ${formatMoney(blk.holdingsValue, market)} [${blk.symbols.join(",")}]`);
      }
    }
  }

  // 4) The close mail (one a day), matching the Python close cycle's mail
  const body = [
    `실행: ${now.toISOString()} · ${account.envKey} · ${market.toUpperCase()}/${portfolio.strategy}`,
    "",
    `오늘 실현손익: ${formatMoney(run, market)} · 누적: ${formatMoney(cum, market)}`,
    balOk ? `현금: ${formatMoney(cash, market)}` : "잔고 조회 실패(스냅샷 생략)",
    "",
    "보유:",
    ...(evalRows.length
      ? evalRows.map(([s, q, a, p]) =>
          `  ${s}: ${q}주 · 평단 ${formatMoney(a, market)} · 현재 ${formatMoney(p, market)} (${(((p - a) / a) * 100 || 0).toFixed(1)}%)`)
      : ["  (없음)"]),
  ].join("\n");
  const mailed = await sendTradingMail(
    `체결 결과 ${today} — ${market.toUpperCase()}/${portfolio.strategy}`, body);
  log(mailed ? "마감 메일 발송 완료" : "메일 미설정/실패 — 스킵");

  return `close-sync: 가격 ${priceSyms}종목 · 매매 ${tradeCount}건 · 실현 ${formatMoney(run, market)}/${formatMoney(cum, market)}`;
}

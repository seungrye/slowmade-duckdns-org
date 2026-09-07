// Infinite buying V4.0 live engine - a port of Python's trading/infinite_v4_engine.py (KIS and Toss).
// Daily flow: reconcile (yesterday's fills -> T, mode, cycleCash) -> cancel resting orders (idempotent) ->
// today's orders (entry LOC / normal: a quarter star-point LOC, a three-quarter target limit and the buy legs / reverse) -> save state.
//
// phase: US "both" (one morning pass - real LOCs: KIS ORD_DVSN 34 / Toss LIMIT+CLS) /
//        KRX "sell" (09:30 - the three-quarter limit sell only) plus "buy" (15:20 - a closing-auction limit
//        emulation: only the legs whose current price, a proxy for the close, qualify). The engine branches by market itself.
// Reconciliation source: KIS uses the account's fill history (inquire-ccnl); Toss has no status=CLOSED, so
// fills are gathered by **querying the details of the orders we placed (orderNo)** (only the site's own orders are reconciled).
// State persists in TradingPortfolio.state.v4 (replacing Python's v4-state-*.json).

import TradingOrderLog from "@/models/trading-order-log";
import TradingPortfolio from "@/models/trading-portfolio";
import type { Types } from "mongoose";
import { KisClient, US_ORDER_EXCD, usQuoteExcd } from "./kis-client";
import { TossClient } from "./toss-client";
import {
  absorbIdleCash, emptyPending, newV4State, reconcileDay,
  type V4Fill, type V4State,
} from "./infinite-v4-state";
import { v4PlanDay, type V4PlannedOrder } from "./v4-plan";
import { marketToday } from "./engines";
import type { CycleLogger } from "./engines";
import { formatMoney } from "@/lib/format";

type Json = Record<string, unknown>;
type OrdKind = "loc" | "limit" | "market";
type Order = { side: "buy" | "sell"; qty: number; price: number; ordType: OrdKind; reason: string };
type OpenRow = { orderNo: string; side: "buy" | "sell"; qty: number };
type DatedFill = V4Fill & { date: string };

export type V4Config = {
  symbol: string;
  principal: number;
  splits: number; // 20 | 40
  starBase: number; // star% base (TQQQ 15 / SOXL 20)
  sellTarget: number; // the 75% limit sell target (0.15)
};

const LOOKBACK_DAYS = 14;

/** The calendar day before a YYYYMMDD date. A pure helper for advancing the reconciliation window's lastRunDate. */
export function prevMarketDay(ymd: string): string {
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(4, 6)), d = Number(ymd.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10).replace(/-/g, "");
}

/** The minimum contract v4 requires of a broker - implemented by the KIS and Toss adapters. */
export type V4Broker = {
  snapshot(sym: string): Promise<{ holding: number; avg: number; price: number; cash: number }>;
  historyLong(sym: string, need: number): Promise<[string, number][]>;
  /** Returns normalised fills over (from, to], with YYYYMMDD dates. */
  executions(sym: string, fromDate: string, toDate: string): Promise<DatedFill[]>;
  openOrders(sym: string): Promise<OpenRow[]>;
  cancel(sym: string, orderNo: string, qty: number): Promise<void>;
  place(sym: string, o: Order): Promise<string>;
};

// ── KIS adapter ──────────────────────────────────────────────────

export function makeV4KisBroker(client: KisClient, market: "kr" | "us"): V4Broker {
  const usExcd = (sym: string) => US_ORDER_EXCD[usQuoteExcd(sym)] ?? "NASD";
  return {
    async snapshot(sym) {
      const [holdings, cash] = market === "kr" ? await client.krAccount() : await client.usAccount();
      const [holding, avg] = holdings[sym] ?? [0, 0];
      const price = market === "kr"
        ? await client.krPrice(sym) : await client.usPrice(sym, usQuoteExcd(sym));
      return { holding, avg, price, cash: Number(cash ?? 0) };
    },
    historyLong: (sym, need) => market === "kr"
      ? client.krHistoryLong(sym, need) : client.usHistoryLong(sym, usQuoteExcd(sym), need),
    async executions(sym, fromDate, toDate) {
      const rows = market === "kr"
        ? await client.krExecutions(sym, fromDate, toDate)
        : await client.usExecutions(sym, fromDate, toDate, usExcd(sym));
      const fills: DatedFill[] = [];
      for (const r of rows as Json[]) {
        const date = String(r.ord_dt ?? "").trim();
        const side = String(r.sll_buy_dvsn_cd ?? "").trim();
        const qty = Number(r.ft_ccld_qty ?? r.ccld_qty ?? r.tot_ccld_qty ?? 0);
        const price = Number(r.avg_prvs ?? r.ft_ccld_unpr3 ?? r.avg_unpr ?? r.ccld_unpr ?? 0);
        if (date && ["01", "02"].includes(side) && qty > 0) {
          fills.push({ date, side: side === "01" ? "sell" : "buy",
                       qty: Math.trunc(qty), price });
        }
      }
      return fills;
    },
    async openOrders(sym) {
      const rows = market === "kr" ? await client.krOpenOrders() : await client.usOpenOrders();
      const out: OpenRow[] = [];
      for (const r of rows as Json[]) {
        if (String(r.pdno ?? "") !== sym) continue;
        const qty = Math.trunc(Number(r.nccs_qty ?? r.rmn_qty ?? r.ord_qty ?? 0));
        const odno = String(r.odno ?? "");
        if (!odno || qty < 1) continue;
        out.push({ orderNo: odno,
                   side: String(r.sll_buy_dvsn_cd ?? "").trim() === "02" ? "buy" : "sell", qty });
      }
      return out;
    },
    async cancel(sym, orderNo, qty) {
      if (market === "kr") await client.krCancelOrder(orderNo, qty);
      else await client.usCancelOrder(sym, orderNo, qty, usExcd(sym));
    },
    async place(sym, o) {
      if (market === "kr") {
        // KRX emulation - LOC and limit go as limits, market goes as market
        return client.krOrder(sym, o.qty, o.side,
          o.ordType === "market" ? { market: true } : { market: false, price: o.price });
      }
      const dvsn = o.ordType === "loc" ? "34" : "00"; // on paper the client falls back to a limit
      return client.usOrder(sym, o.qty, o.price, o.side, usExcd(sym), dvsn);
    },
  };
}

// ── Toss adapter ─────────────────────────────────────────────────

export function makeV4TossBroker(
  client: TossClient, market: "kr" | "us", accountId: Types.ObjectId,
): V4Broker {
  return {
    async snapshot(sym) {
      const [holdings, cash] = await client.account(market);
      const [holding, avg] = holdings[sym] ?? [0, 0];
      return { holding, avg, price: await client.price(sym), cash: Number(cash ?? 0) };
    },
    historyLong: (sym, need) => client.historyLong(sym, need),
    async executions(sym, fromDate, toDate) {
      // status=CLOSED is unsupported, so fills are gathered from the details of the orders we logged (orderNo).
      const since = new Date(
        Date.UTC(+fromDate.slice(0, 4), +fromDate.slice(4, 6) - 1, +fromDate.slice(6, 8)) - 86400_000,
      );
      const logs = await TradingOrderLog.find({
        accountId, symbol: sym, dryRun: false, orderNo: { $ne: "" },
        createdAt: { $gte: since },
      }).lean();
      const fills: DatedFill[] = [];
      for (const orderNo of [...new Set(logs.map((l) => l.orderNo))]) {
        try {
          const d = await client.orderDetail(orderNo);
          const ex = (d.execution ?? {}) as Json;
          const qty = Math.trunc(Number(ex.filledQuantity ?? 0));
          if (qty < 1) continue;
          const at = String(ex.filledAt ?? d.orderedAt ?? "");
          const date = at.slice(0, 10).replace(/-/g, "");
          if (!date || date < fromDate || date > toDate) continue;
          fills.push({
            date,
            side: String(d.side ?? "").toUpperCase() === "SELL" ? "sell" : "buy",
            qty,
            price: Number(ex.averageFilledPrice ?? d.price ?? 0),
          });
        } catch {
          continue; // Isolate per order, so one failed query does not block the whole reconciliation
        }
      }
      return fills;
    },
    async openOrders(sym) {
      const rows = await client.openOrders(sym);
      return rows.map((r) => ({
        orderNo: String(r.orderId ?? ""),
        side: String(r.side ?? "").toUpperCase() === "BUY" ? "buy" as const : "sell" as const,
        qty: Math.trunc(Number(r.quantity ?? 0)),
      })).filter((r) => r.orderNo && r.qty >= 1);
    },
    async cancel(_sym, orderNo) {
      await client.cancelOrder(orderNo);
    },
    async place(sym, o) {
      if (o.ordType === "market") return client.orderMarket(sym, o.qty, o.side);
      // LOC: native on the US side (LIMIT+CLS), emulated on KRX (an ordinary limit - the phase gate decides)
      const cls = o.ordType === "loc" && market === "us";
      return client.orderLimit(sym, o.qty, o.side, o.price, { cls });
    },
  };
}

// ── The cycle ──────────────────────────────────────────────────

function parseCfg(config: Json): V4Config {
  const symbol = String(config.symbol ?? "");
  if (!symbol) throw new Error("infinite_v4 config 에 symbol 필요");
  const principal = Number(config.principal ?? 0);
  if (!(principal > 0)) throw new Error("infinite_v4 config 에 principal(양수) 필요");
  return {
    symbol, principal,
    splits: Number(config.splits ?? 20),
    starBase: Number(config.starBase ?? 15),
    sellTarget: Number(config.sellTarget ?? 15) / 100,
  };
}

function loadState(raw: unknown, cfg: V4Config): V4State {
  const v = (raw ?? {}) as Partial<V4State>;
  if (typeof v.cycleCash === "number" && typeof v.t === "number" && v.pending) {
    // Progress (t, cycleCash, mode, pending and so on) carries over, but splits is taken from config as the source.
    // reconcileDay's reverse trigger (t > splits - 1) and decay (0.9/0.95) read s.splits, so this is what makes
    // a mid-cycle change to config.splits take effect at once. (Previously the stale state.splits in ...v
    // overrode config, leaving order size at 20 while reverse used 40.)
    return { ...newV4State(cfg.symbol, cfg.splits, cfg.principal), ...v, splits: cfg.splits } as V4State;
  }
  return newV4State(cfg.symbol, cfg.splits, cfg.principal);
}

export async function runInfiniteV4(
  account: { _id: Types.ObjectId; envKey: string; liveEnabled?: boolean | null },
  portfolio: { _id: Types.ObjectId; market: string; strategy: string; config: unknown; state?: unknown },
  runId: Types.ObjectId,
  broker: V4Broker,
  phase: "both" | "sell" | "buy",
  log: CycleLogger,
): Promise<string> {
  const market = portfolio.market as "kr" | "us";
  const cfg = parseCfg((portfolio.config ?? {}) as Json);
  const sym = cfg.symbol;
  const live = Boolean(account.liveEnabled) && process.env.TRADING_LIVE_ALLOWED === "true";
  const today = marketToday(market);

  const { holding, avg, price, cash } = await broker.snapshot(sym);

  // ── 1) Reconcile - apply fills since the last run date (today excluded), day by day ──
  let state = loadState((portfolio.state as Json | undefined)?.v4, cfg);
  const start = state.lastRunDate ||
    new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
  try {
    const fills = (await broker.executions(sym, start, today))
      .filter((f) => state.lastRunDate < f.date && f.date < today);
    for (const date of [...new Set(fills.map((f) => f.date))].sort()) {
      const day = fills.filter((f) => f.date === date);
      state = reconcileDay(state, day, holding);
      log(`[v4:${sym}] ${date} 체결 반영: 매수 ${day.filter((f) => f.side === "buy").length}건·` +
          `매도 ${day.filter((f) => f.side === "sell").length}건 → T=${state.t.toFixed(2)} ` +
          `mode=${state.mode} cash=${formatMoney(state.cycleCash, market)}`);
    }
  } catch (e) {
    log(`[v4:${sym}] 체결 반영 실패 → 상태 유지: ${e instanceof Error ? e.message : e}`);
  }

  // ── 1.5) Absorb idle cash (deposits) to remove cash drag. cycleCash is reseeded from account cash only while the position is flat.
  const reinvest = ((portfolio.config ?? {}) as Json).reinvestIdleCash !== false; // on by default
  {
    const before = state.cycleCash;
    state = absorbIdleCash(state, cash, holding, reinvest);
    if (state.cycleCash !== before) {
      log(`[v4:${sym}] 유휴현금 반영 cycleCash ${formatMoney(before, market)}→${formatMoney(state.cycleCash, market)}(플랫 — 입금/미투입 흡수)`);
    }
  }

  // ── 2) Cancel resting orders (idempotent) - the buy phase cancels only buys, keeping the 09:30 sells ──
  try {
    for (const r of await broker.openOrders(sym)) {
      if (phase === "buy" && r.side !== "buy") continue;
      if (!live) {
        log(`[DRY-RUN] 미체결 취소 ${r.orderNo} x${r.qty}`);
        continue;
      }
      await broker.cancel(sym, r.orderNo, r.qty);
      log(`미체결 취소 ${r.orderNo} x${r.qty}`);
    }
  } catch (e) {
    log(`[v4:${sym}] 미체결 조회 실패 → 취소 스킵: ${e instanceof Error ? e.message : e}`);
  }

  // ── 3) Build today's orders - v4PlanDay() as the single source (the same function as the backtest) ──
  // The engine only handles the phase gate (the KRX LOC emulation: the buy phase sends only the legs whose
  // current price, a proxy for the close, qualifies), sending, and persisting pending.
  const locBuyOk = (limit: number) => (phase === "both" ? true : price <= limit);
  const locSellOk = (limit: number) => (phase === "both" ? true : price >= limit);
  const orders: Order[] = [];
  const pend = emptyPending();

  if (state.mode === "reverse" && state.recoverConfirmed) {
    state.mode = "normal";
    state.recoverConfirmed = false;
  }

  let prev5: number[] = [];
  if (state.mode === "reverse") {
    const hist = await broker.historyLong(sym, 10);
    prev5 = hist.filter(([d]) => d < today).slice(0, 5).map(([, c]) => c);
  }

  const plan = v4PlanDay({
    mode: state.mode, t: state.t, avg, holding, cash: state.cycleCash,
    refPrice: price, entryLimit: state.entryLimit || null, prev5,
    reverseFirstDay: state.reverseFirstDay,
    cfg: { splits: cfg.splits, starBase: cfg.starBase, sellTarget: cfg.sellTarget },
  });
  if (state.mode === "normal" && holding > 0) {
    pend.one = state.cycleCash / Math.max(0.5, cfg.splits - state.t);
  }

  const REASON: Record<V4PlannedOrder["tag"], string> = {
    entry: "V4 첫 매수(전일종가+10% LOC)", star: "V4 별지점 매수", avg: "V4 평단 매수",
    rung: "V4 사다리 매수(X/k)", big: "V4 큰수 매수(접어내림)",
    q25: `V4 쿼터매도(별지점 T=${state.t.toFixed(2)})`,
    q75: `V4 75% 익절(평단+${Math.round(cfg.sellTarget * 100)}%)`,
    rev_first: "V4 리버스 첫날 무조건 매도(MOC 근사)",
    rev_sell: "V4 리버스 등분 매도(별지점R 위)", rev_qbuy: "V4 리버스 쿼터매수(별지점R 아래)",
  };
  for (const o of plan) {
    if (o.side === "sell") {
      // q75 (an intraday limit) and rev_first (MOC) go in the sell phase; LOC sells (q25/rev_sell) go in the buy phase (emulated)
      if (o.tag === "q75" || o.tag === "rev_first") {
        if (phase === "buy") continue;
        orders.push({ side: "sell", qty: o.qty, price: o.price,
                      ordType: o.kind === "market" ? "market" : "limit", reason: REASON[o.tag] });
        if (o.tag === "rev_first") pend.reverseFirst = true;
        else pend.q75 = o.qty;
      } else {
        if (phase === "sell" || !locSellOk(o.price)) continue;
        orders.push({ side: "sell", qty: o.qty, price: o.price, ordType: "loc", reason: REASON[o.tag] });
        if (o.tag === "q25") pend.q25 = o.qty;
        else pend.reverseSell = o.qty;
      }
    } else { // buy — 전부 LOC(진입·사다리 포함)
      if (phase === "sell" || !locBuyOk(o.price)) continue;
      orders.push({ side: "buy", qty: o.qty, price: o.price, ordType: "loc", reason: REASON[o.tag] });
    }
  }

  if (holding === 0 && state.mode === "normal" && phase !== "sell") {
    state.entryLimit = price * 1.10; // refresh the reference in case it goes unfilled
  }
  if (state.mode === "reverse") {
    const prevClose = prev5[0] ?? price;
    if (holding > 0 && avg > 0 && prevClose > avg * (1 - cfg.sellTarget)) {
      state.recoverConfirmed = true;
    }
  }

  // ── 4) Send the orders (behind the dry-run gate) and save the state ──
  for (const o of orders) {
    let orderNo = "";
    try {
      if (live) {
        orderNo = await broker.place(sym, o);
        log(`주문 접수 ${orderNo} — ${o.side} x${o.qty} @${formatMoney(o.price, market)} (${o.ordType})`);
      } else {
        log(`[DRY-RUN] ${o.side} ${sym} x${o.qty} @${formatMoney(o.price, market)} (${o.ordType}) — ${o.reason}`);
      }
    } catch (e) {
      // Isolate per order, so one rejection (a tick-size violation, say) does not block the rest or the state save.
      log(`주문 실패(${o.side} x${o.qty} @${formatMoney(o.price, market)}) — 다음 주문 계속: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    await TradingOrderLog.create({
      accountId: account._id, runId, envKey: account.envKey,
      market, strategy: "infinite_v4",
      symbol: sym, side: o.side, qty: o.qty, price: Math.round(o.price * 100) / 100,
      ordType: o.ordType, reason: o.reason, dryRun: !live, orderNo,
    });
  }

  state.pending = pend;
  // Why yesterday: a LOC order fills at that day's close, so the fill date equals the run date (today). The
  // reconciliation filter is `lastRunDate < date < today` (strict on both sides), so leaving lastRunDate at
  // today empties the next run's window (yesterday < date < today) every day and the previous close's fills are
  // never applied (a frozen-ledger bug). Leaving lastRunDate at yesterday (the last fully applied day) keeps the window continuous.
  // In the two-phase case (sell 09:30 and buy 15:20 the same day), sell moving it to yesterday still leaves the buy window empty, so nothing is applied twice.
  state.lastRunDate = prevMarketDay(today);
  await TradingPortfolio.updateOne({ _id: portfolio._id }, { $set: { "state.v4": state } });

  const line = `V4 ${sym}[${phase}]: 주문 ${orders.length}건 (T=${state.t.toFixed(2)} ` +
    `mode=${state.mode} 보유 ${holding})`;
  log(line);
  return line;
}

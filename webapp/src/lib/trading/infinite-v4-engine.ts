// 무한매수 V4.0 라이브 엔진 — 파이썬 trading/infinite_v4_engine.py 포팅(KIS·토스 겸용).
// 일일 흐름: 대사(전일 체결→T·모드·cycleCash) → 미체결 취소(멱등) →
// 오늘 주문(진입 LOC / normal ¼별지점 LOC+¾목표 지정가+매수 레그 / reverse) → 상태 저장.
//
// phase: 미장 "both"(아침 1회 — 실제 LOC: KIS ORD_DVSN 34 / 토스 LIMIT+CLS) /
//        국장 "sell"(09:30 — ¾ 지정가 매도만) + "buy"(15:20 — 동시호가 지정가 에뮬:
//        현재가(≈종가)가 조건을 만족하는 레그만 전송). 시장 분기는 엔진이 자동.
// 대사 소스: KIS 는 계좌 체결내역(inquire-ccnl), 토스는 status=CLOSED 미지원이라
// **우리가 낸 주문 로그(orderNo)의 상세 조회**로 체결을 취합한다(사이트 주문만 대사).
// 상태는 TradingPortfolio.state.v4 에 영속(파이썬 v4-state-*.json 대체).

import TradingOrderLog from "@/models/trading-order-log";
import TradingPortfolio from "@/models/trading-portfolio";
import type { Types } from "mongoose";
import { KisClient, US_ORDER_EXCD, usQuoteExcd } from "./kis-client";
import { TossClient } from "./toss-client";
import {
  emptyPending, newV4State, reconcileDay,
  type V4Fill, type V4State,
} from "./infinite-v4-state";
import { marketToday } from "./engines";
import type { CycleLogger } from "./engines";

type Json = Record<string, unknown>;
type OrdKind = "loc" | "limit" | "market";
type Order = { side: "buy" | "sell"; qty: number; price: number; ordType: OrdKind; reason: string };
type OpenRow = { orderNo: string; side: "buy" | "sell"; qty: number };
type DatedFill = V4Fill & { date: string };

export type V4Config = {
  symbol: string;
  principal: number;
  splits: number; // 20 | 40
  starBase: number; // 별% base(TQQQ 15 / SOXL 20)
  sellTarget: number; // 75% 지정가매도 목표(0.15)
};

const LOOKBACK_DAYS = 14;

/** v4 가 브로커에 요구하는 최소 계약 — KIS/토스 어댑터가 구현. */
export type V4Broker = {
  snapshot(sym: string): Promise<{ holding: number; avg: number; price: number }>;
  historyLong(sym: string, need: number): Promise<[string, number][]>;
  /** (from, to] 구간 체결을 정규화해 반환 — 날짜 YYYYMMDD. */
  executions(sym: string, fromDate: string, toDate: string): Promise<DatedFill[]>;
  openOrders(sym: string): Promise<OpenRow[]>;
  cancel(sym: string, orderNo: string, qty: number): Promise<void>;
  place(sym: string, o: Order): Promise<string>;
};

// ── KIS 어댑터 ──────────────────────────────────────────────────

export function makeV4KisBroker(client: KisClient, market: "kr" | "us"): V4Broker {
  const usExcd = (sym: string) => US_ORDER_EXCD[usQuoteExcd(sym)] ?? "NASD";
  return {
    async snapshot(sym) {
      const [holdings] = market === "kr" ? await client.krAccount() : await client.usAccount();
      const [holding, avg] = holdings[sym] ?? [0, 0];
      const price = market === "kr"
        ? await client.krPrice(sym) : await client.usPrice(sym, usQuoteExcd(sym));
      return { holding, avg, price };
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
        // 국장 에뮬 — LOC/지정가는 지정가로, 시장가는 시장가로
        return client.krOrder(sym, o.qty, o.side,
          o.ordType === "market" ? { market: true } : { market: false, price: o.price });
      }
      const dvsn = o.ordType === "loc" ? "34" : "00"; // 모의는 client 가 지정가 폴백
      return client.usOrder(sym, o.qty, o.price, o.side, usExcd(sym), dvsn);
    },
  };
}

// ── 토스 어댑터 ─────────────────────────────────────────────────

export function makeV4TossBroker(
  client: TossClient, market: "kr" | "us", accountId: Types.ObjectId,
): V4Broker {
  return {
    async snapshot(sym) {
      const [holdings] = await client.account(market);
      const [holding, avg] = holdings[sym] ?? [0, 0];
      return { holding, avg, price: await client.price(sym) };
    },
    historyLong: (sym, need) => client.historyLong(sym, need),
    async executions(sym, fromDate, toDate) {
      // status=CLOSED 미지원 → 우리가 기록한 실주문(orderNo)의 상세로 체결 취합.
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
          continue; // 주문 단위 격리 — 하나의 조회 실패가 대사 전체를 막지 않게
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
      // LOC: 미국은 네이티브(LIMIT+CLS), 국장은 에뮬(일반 지정가 — phase 게이트가 판단)
      const cls = o.ordType === "loc" && market === "us";
      return client.orderLimit(sym, o.qty, o.side, o.price, { cls });
    },
  };
}

// ── 사이클 ──────────────────────────────────────────────────────

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
    return { ...newV4State(cfg.symbol, cfg.splits, cfg.principal), ...v } as V4State;
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

  const { holding, avg, price } = await broker.snapshot(sym);

  // ── 1) 대사 — 마지막 실행일 이후(오늘 제외) 체결을 일자별 적용 ──
  let state = loadState((portfolio.state as Json | undefined)?.v4, cfg);
  const start = state.lastRunDate ||
    new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
  try {
    const fills = (await broker.executions(sym, start, today))
      .filter((f) => state.lastRunDate < f.date && f.date < today);
    for (const date of [...new Set(fills.map((f) => f.date))].sort()) {
      const day = fills.filter((f) => f.date === date);
      state = reconcileDay(state, day, holding);
      log(`[v4:${sym}] ${date} 대사: 매수 ${day.filter((f) => f.side === "buy").length}건·` +
          `매도 ${day.filter((f) => f.side === "sell").length}건 → T=${state.t.toFixed(2)} ` +
          `mode=${state.mode} cash=${state.cycleCash.toFixed(0)}`);
    }
  } catch (e) {
    log(`[v4:${sym}] 체결 대사 실패 → 상태 유지: ${e instanceof Error ? e.message : e}`);
  }

  // ── 2) 미체결 취소(멱등) — buy phase 는 09:30 매도를 살리려 매수만 취소 ──
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

  // ── 3) 오늘 주문 생성 ──
  const starPct = (t: number) => (cfg.starBase - (2 * cfg.starBase * t) / cfg.splits) / 100;
  const locBuyOk = (limit: number) => (phase === "both" ? true : price <= limit);
  const locSellOk = (limit: number) => (phase === "both" ? true : price >= limit);
  const orders: Order[] = [];
  const pend = emptyPending();

  if (state.mode === "reverse" && state.recoverConfirmed) {
    state.mode = "normal";
    state.recoverConfirmed = false;
  }

  if (holding === 0 && state.mode === "normal") {
    if (phase !== "sell") {
      const limit = state.entryLimit || price * 1.10;
      const one = state.cycleCash / cfg.splits;
      const q = Math.floor(one / limit);
      if (q >= 1 && locBuyOk(limit)) {
        orders.push({ side: "buy", qty: q, price: limit, ordType: "loc",
                      reason: "V4 첫 매수(전일종가+10% LOC)" });
      }
      state.entryLimit = price * 1.10;
    }
  } else if (state.mode === "normal") {
    const starPoint = avg * (1 + starPct(state.t));
    const one = state.cycleCash / Math.max(0.5, cfg.splits - state.t);
    pend.one = one;
    const q25 = Math.floor(holding / 4);
    const q75 = holding - q25;
    if (phase !== "buy" && q75 >= 1) {
      orders.push({ side: "sell", qty: q75, price: avg * (1 + cfg.sellTarget), ordType: "limit",
                    reason: `V4 75% 익절(평단+${Math.round(cfg.sellTarget * 100)}%)` });
      pend.q75 = q75;
    }
    if (phase !== "sell" && q25 >= 1 && locSellOk(starPoint)) {
      orders.push({ side: "sell", qty: q25, price: starPoint, ordType: "loc",
                    reason: `V4 쿼터매도(별지점 T=${state.t.toFixed(2)})` });
      pend.q25 = q25;
    }
    if (phase !== "sell" && state.t <= cfg.splits - 1) {
      if (state.t < cfg.splits / 2) {
        const qStar = starPoint > 0 ? Math.floor(one / 2 / starPoint) : 0;
        if (qStar >= 1 && locBuyOk(starPoint)) {
          orders.push({ side: "buy", qty: qStar, price: starPoint, ordType: "loc",
                        reason: "V4 전반 별지점 매수" });
        }
        const rest = one - qStar * starPoint;
        const qAvg = avg > 0 ? Math.floor(rest / avg) : 0;
        if (qAvg >= 1 && locBuyOk(avg)) {
          orders.push({ side: "buy", qty: qAvg, price: avg, ordType: "loc",
                        reason: "V4 전반 평단 매수(사다리 포함)" });
        }
      } else {
        const q = starPoint > 0 ? Math.floor(one / starPoint) : 0;
        if (q >= 1 && locBuyOk(starPoint)) {
          orders.push({ side: "buy", qty: q, price: starPoint, ordType: "loc",
                        reason: "V4 후반 별지점 매수" });
        }
      }
    }
  } else {
    // reverse — 별지점R = 직전 5거래일 종가평균
    const hist = await broker.historyLong(sym, 10);
    const prev5 = hist.filter(([d]) => d < today).slice(0, 5).map(([, c]) => c);
    const starR = prev5.length >= 5 ? prev5.reduce((a, b) => a + b, 0) / prev5.length : price;
    let sellQ = Math.floor(holding / (cfg.splits / 2));
    if (sellQ < 1 && holding > 0) sellQ = 1;
    if (state.reverseFirstDay) {
      if (phase !== "buy" && sellQ >= 1) {
        orders.push({ side: "sell", qty: sellQ, price, ordType: "market",
                      reason: "V4 리버스 첫날 무조건 매도(MOC 근사)" });
        pend.reverseFirst = true;
      }
    } else {
      if (phase !== "sell" && sellQ >= 1 && locSellOk(starR)) {
        orders.push({ side: "sell", qty: sellQ, price: starR, ordType: "loc",
                      reason: "V4 리버스 등분 매도(별지점R 위)" });
        pend.reverseSell = sellQ;
      }
      if (phase !== "sell") {
        const q = starR > 0 ? Math.floor(state.cycleCash / 4 / starR) : 0;
        if (q >= 1 && locBuyOk(starR)) {
          orders.push({ side: "buy", qty: q, price: starR, ordType: "loc",
                        reason: "V4 리버스 쿼터매수(별지점R 아래)" });
        }
      }
    }
    const prevClose = prev5[0] ?? price;
    if (holding > 0 && avg > 0 && prevClose > avg * (1 - cfg.sellTarget)) {
      state.recoverConfirmed = true;
    }
  }

  // ── 4) 주문 전송(dry-run 게이트) + 상태 저장 ──
  for (const o of orders) {
    let orderNo = "";
    try {
      if (live) {
        orderNo = await broker.place(sym, o);
        log(`주문 접수 ${orderNo} — ${o.side} x${o.qty} @${o.price.toFixed(2)} (${o.ordType})`);
      } else {
        log(`[DRY-RUN] ${o.side} ${sym} x${o.qty} @${o.price.toFixed(2)} (${o.ordType}) — ${o.reason}`);
      }
    } catch (e) {
      // 주문 단위 격리 — 한 건 거부(호가단위 등)가 나머지 주문·상태 저장을 막지 않게.
      log(`주문 실패(${o.side} x${o.qty} @${o.price.toFixed(2)}) — 다음 주문 계속: ${e instanceof Error ? e.message : e}`);
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
  state.lastRunDate = today;
  await TradingPortfolio.updateOne({ _id: portfolio._id }, { $set: { "state.v4": state } });

  const line = `V4 ${sym}[${phase}]: 주문 ${orders.length}건 (T=${state.t.toFixed(2)} ` +
    `mode=${state.mode} 보유 ${holding})`;
  log(line);
  return line;
}

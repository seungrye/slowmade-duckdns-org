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
import { savePortfolioState, type StateSaver } from "./state-saver";
import { isStillLive } from "./killswitch";
import { summarizeRejects } from "./reject-reason";
import type { Types } from "mongoose";
import { KisClient, US_ORDER_EXCD, usQuoteExcd } from "./kis-client";
import { TossClient } from "./toss-client";
import {
  absorbIdleCash, emptyPending, newV4State, reconcileDay, recordPending,
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
  starBase: number; // 별% base(TQQQ 15 / SOXL 20)
  sellTarget: number; // 75% 지정가매도 목표(0.15)
};

const LOOKBACK_DAYS = 14;

/** YYYYMMDD 의 하루 전(캘린더일). 대사 윈도우의 lastRunDate 갱신용 순수 헬퍼. */
export function prevMarketDay(ymd: string): string {
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(4, 6)), d = Number(ymd.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10).replace(/-/g, "");
}

/** v4 가 브로커에 요구하는 최소 계약 — KIS/토스 어댑터가 구현. */
export type V4Broker = {
  snapshot(sym: string): Promise<{ holding: number; avg: number; price: number; cash: number }>;
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
      // 주문은 종목 거래소로 나간다(place 의 usExcd) — 조회도 같은 거래소여야 미체결이
      // 잡힌다. 기본 NASD 로 두면 AMEX/NYSE 종목의 취소 안전망이 통째로 no-op 이 된다 (#489).
      const rows = market === "kr"
        ? await client.krOpenOrders() : await client.usOpenOrders(usExcd(sym));
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
      const [holdings, cash] = await client.account(market);
      const [holding, avg] = holdings[sym] ?? [0, 0];
      return { holding, avg, price: await client.price(sym), cash: Number(cash ?? 0) };
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
    // 진행 상태(t·cycleCash·mode·pending 등)는 이어받되 splits 는 config 를 원본으로 삼는다.
    // reconcileDay 의 reverse 트리거(t > splits−1)·감쇠(0.9/0.95)는 s.splits 를 읽으므로,
    // 사이클 도중 config.splits 를 바꿔도 이렇게 해야 즉시 반영된다. (예전엔 ...v 의 stale
    // state.splits 가 config 를 덮어 주문사이즈=20 / reverse=40 로 혼재됐다.)
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
  // 상태를 남기는 문 (#488) — 일회성 실행(run-now)은 버리는 구현을 받는다.
  saveState: StateSaver = savePortfolioState(portfolio._id),
): Promise<string> {
  const market = portfolio.market as "kr" | "us";
  const cfg = parseCfg((portfolio.config ?? {}) as Json);
  const sym = cfg.symbol;
  const live = Boolean(account.liveEnabled) && process.env.TRADING_LIVE_ALLOWED === "true";
  const today = marketToday(market);

  const { holding, avg, price, cash } = await broker.snapshot(sym);
  // 오염된 입력은 조용히 넘기지 않는다 (#491). 예전엔 price=0 이면 매도 조건이 전부 탈락해
  // **주문 0건으로 done** 이 됐다 — 익절이 하루 빠졌는데 어디에도 안 남는다. 던져야 #487
  // 재시도가 걸리고 실패 메일이 나간다. (KIS 는 장 마감·휴장 시 현재가 0 을 줄 수 있다.)
  if (!(price > 0)) {
    throw new Error(`v4 ${sym}: 현재가가 ${price} — 사이클 중단(휴장·응답 오류 추정)`);
  }
  if (holding > 0 && !(avg > 0)) {
    throw new Error(`v4 ${sym}: 보유 ${holding}주인데 평단이 ${avg} — 잔고 응답 오염, 사이클 중단`);
  }

  // ── 1) 대사 — 마지막 실행일 이후(오늘 제외) 체결을 일자별 적용 ──
  // degraded = 대사를 못 했다 → t·cycleCash·mode 가 낡았다 (#497).
  let degraded = false;
  let state = loadState((portfolio.state as Json | undefined)?.v4, cfg);
  // 새 상태(lastRunDate 없음)는 **대사하지 않는다** (#515). 예전엔 start 가 '오늘−14일' 이
  // 되고 필터의 `"" < f.date` 가 그 14일을 전부 통과시켰다. 계좌를 옮겨 상태를 초기화한
  // 직후라면 그 체결은 **우리 것이 아니다** — 남이 손매매한 것까지 reconcileDay 에 들어가
  // `cycleCash += sellAmt − buyAmt` 로 장부만 깎는다(갓 만든 상태는 entryLimit=0·
  // pending.one=0 이라 T 증가 분기가 전부 false 라 회차는 안 오른다). 새 상태엔 대사할
  // 우리 체결이 없으므로 조회 자체를 안 한다.
  const fresh = !state.lastRunDate;
  const start = state.lastRunDate ||
    new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
  try {
    const fills = fresh ? [] : (await broker.executions(sym, start, today))
      .filter((f) => state.lastRunDate < f.date && f.date < today);
    for (const date of [...new Set(fills.map((f) => f.date))].sort()) {
      const day = fills.filter((f) => f.date === date);
      state = reconcileDay(state, day, holding, date);
      log(`[v4:${sym}] ${date} 체결 반영: 매수 ${day.filter((f) => f.side === "buy").length}건·` +
          `매도 ${day.filter((f) => f.side === "sell").length}건 → T=${state.t.toFixed(2)} ` +
          `mode=${state.mode} cash=${formatMoney(state.cycleCash, market)}`);
    }
  } catch (e) {
    // 창을 전진시키지 않는다 (#497). 예전엔 아래에서 무조건 lastRunDate 를 '어제'로
    // 올려, 대사 필터(`lastRunDate < date < today`)가 **실패한 날의 체결을 영영 건너뛰었다.**
    // 2026-08-14 에 실제로 났다(OPSQ0003) — 08-13 의 12주 매도가 T 에 반영되지 않았다.
    // 그대로 두면 다음 실행의 창이 놓친 날까지 넓어져 자가치유된다.
    degraded = true;
    log(`[v4:${sym}] ⚠ 체결 반영 실패 — 대사 창을 유지하고, 낡은 상태에 기대는 주문은 보류한다: `
      + `${e instanceof Error ? e.message : e}`);
  }

  // ── 1.5) 유휴현금(입금) 흡수 — 현금 드래그 제거. 포지션 플랫일 때만 cycleCash 를 계좌현금으로 재시드.
  const reinvest = ((portfolio.config ?? {}) as Json).reinvestIdleCash !== false; // 기본 활성
  {
    const before = state.cycleCash;
    // 대사 실패일엔 건너뛴다 (#497). absorb 는 cycleCash 를 계좌현금으로 **덮어쓰는데**,
    // 못 읽은 체결의 대금이 이미 계좌현금에 들어 있으므로 내일 그 체결을 대사하면
    // 같은 돈을 두 번 세게 된다.
    state = degraded ? state : absorbIdleCash(state, cash, holding, reinvest, cfg.principal);
    if (state.cycleCash !== before) {
      log(`[v4:${sym}] 유휴현금 반영 cycleCash ${formatMoney(before, market)}→${formatMoney(state.cycleCash, market)}(플랫 — 입금/미투입 흡수)`);
    }
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

  // ── 3) 오늘 주문 생성 — v4PlanDay() 단일 소스(백테스트와 같은 함수) ──
  // 엔진은 phase 게이트(국장 LOC 에뮬: buy phase 는 현재가≈종가가 조건 충족 레그만 전송)와
  // 전송·pending 영속만 담당한다.
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
    // 대사가 낡았으면 q75 만 낸다 (#497). q75 는 `avg`·`holding` 만 쓰고 둘 다 브로커에서
    // 방금 받은 값이라 상태와 무관하다. 나머지는 전부 t·cycleCash·mode 에 기댄다 —
    // 별지점(q25)·매수 사다리·리버스 매도. 출구는 열어 두고 신규 노출만 막는다.
    if (degraded && o.tag !== "q75") continue;
    if (o.side === "sell") {
      // q75(장중 지정가)·rev_first(MOC)는 sell phase, LOC 매도(q25/rev_sell)는 buy phase(에뮬)
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
    state.entryLimit = price * 1.10; // 다음 기준 갱신(미체결 대비)
  }
  if (state.mode === "reverse") {
    const prevClose = prev5[0] ?? price;
    if (holding > 0 && avg > 0 && prevClose > avg * (1 - cfg.sellTarget)) {
      state.recoverConfirmed = true;
    }
  }

  // ── 3.5) 주문 전 현금 게이트 (#519) ──────────────────────────────
  //
  // 예약현금(reservedCash)이 v4 주문 크기에 **전혀 상한으로 작동하지 않았다.** 사이징은
  // `state.cycleCash` 만 쓰고(위 v4PlanDay), 브로커 cash 는 `absorbIdleCash` 한 곳에만
  // 들어가는데 그 함수는 `next > cycleCash` 일 때만 반영이라 캡이 **구조적으로 못
  // 내려간다**. 실측: kr 예약 678만 vs principal 1,091만(61% 초과), TQQQ 52,000 vs
  // 93,300(79% 초과). 같은 계좌의 VR 은 cash 를 하드 캡으로 쓰는데 v4 만 안 썼다.
  //
  // **cycleCash 를 런타임에 깎지 않는다** — 복리로 불어난 장부(#485)가 잘리고, 사이클
  // 도중 `shot = cycleCash/(splits−t)` 스케줄이 끊긴다. 대신 파이썬 `engine.run_once` 와
  // 같이 **전송 직전에 가용현금 안에서만 매수를 내보낸다.** 매도(익절)는 보호 주문이라
  // 현금과 무관하게 항상 보낸다.
  {
    let left = Number.isFinite(cash) ? cash : 0;
    const kept: typeof orders = [];
    const held: typeof orders = [];
    let skipped = 0, skippedCost = 0;
    for (const o of orders) {
      if (o.side !== "buy") { kept.push(o); continue; }
      const cost = o.qty * o.price;
      if (cost > left) { skipped++; skippedCost += cost; held.push(o); continue; }
      left -= cost;
      kept.push(o);
    }
    if (skipped) {
      log(`[v4:${sym}] 현금 부족 — 매수 ${skipped}건 보류(${formatMoney(skippedCost, market)} `
        + `> 가용 ${formatMoney(cash, market)}). 장부 ${formatMoney(state.cycleCash, market)} 는 그대로 둔다.`);
      // **떨어낸 주문도 원장에 남긴다** (#521). 예전엔 orders 에서 빼기만 해서 원장이 0줄이고,
      // 전량 skip 이면 `orders.length === 0` 이라 아래 실패 게이트에도 안 걸려 done 으로 끝났다 —
      // "왜 안 샀는지" 를 사후에 볼 방법이 없었다. 주문번호 없는 행으로 사유와 함께 남긴다.
      for (const o of held) {
        try {
          await TradingOrderLog.create({
            runId, accountId: account._id, portfolioId: portfolio._id, envKey: account.envKey,
            // strategy 는 **필수**다 — 빠지면 create 가 ValidationError 로 100% throw 해서
            // #521 이 넣은 "보류도 원장에 남긴다" 가 한 줄도 안 남았다 (#523).
            strategy: "infinite_v4",
            market, symbol: sym, side: o.side, qty: o.qty, price: o.price, ordType: o.ordType,
            reason: `${o.reason} — 현금 부족 보류(가용 ${formatMoney(cash, market)})`,
            dryRun: !live, orderNo: "",
          });
        } catch (e) {
          log(`⚠ 보류 주문 기록 실패: ${e instanceof Error ? e.message : e}`);
        }
      }
      orders.length = 0;
      orders.push(...kept);
    }
  }

  // ── 4) 주문 전송(dry-run 게이트) + 상태 저장 ──
  let accepted = 0, rejected = 0;
  const rejectMsgs: string[] = [];
  for (const o of orders) {
    let orderNo = "";
    let error = "";
    try {
      if (live) {
        // **주문 직전 재확인** (#509). live 는 사이클 시작 때 한 번 계산되므로, 킬스위치를
        // 눌러도 도는 사이클은 계속 주문한다 — VR 은 1초 간격으로 20건 넘게 낸다.
        if (!(await isStillLive(account._id))) {
          log(`⛔ 킬스위치 — 남은 주문 중단(${orders.length - accepted - rejected}건 미전송)`);
          break;
        }
        orderNo = await broker.place(sym, o);
        accepted++;
        log(`주문 접수 ${orderNo} — ${o.side} x${o.qty} @${formatMoney(o.price, market)} (${o.ordType})`);
      } else {
        log(`[DRY-RUN] ${o.side} ${sym} x${o.qty} @${formatMoney(o.price, market)} (${o.ordType}) — ${o.reason}`);
      }
    } catch (e) {
      // 주문 단위 격리 — 한 건 거부(호가단위 등)가 나머지 주문·상태 저장을 막지 않게.
      rejected++;
      error = e instanceof Error ? e.message : String(e);
      rejectMsgs.push(error);
      log(`주문 실패(${o.side} x${o.qty} @${formatMoney(o.price, market)}) — 다음 주문 계속: ${error}`);
    }
    // 거부도 남긴다 (#507). 예전엔 `continue` 로 건너뛰어 **흔적이 0** 이었다 — 6영업일간
    // 100% 거부된 것이 어디에도 안 남고 요약은 "주문 17건" 으로 성공처럼 찍혔다.
    //
    // ⚠ 기록은 전송과 **같은 반복 안**에서 한다. 이 원장이 `canRetryRun` 의 "실주문 0건"
    //   판정 근거라, 접수는 됐는데 기록이 빠지면 재시도 가드가 오판해 **같은 주문을 다시**
    //   낸다. 기록 실패는 조용히 넘기지 말고 크게 남긴다.
    try {
      await TradingOrderLog.create({
        accountId: account._id, runId, envKey: account.envKey,
        market, strategy: "infinite_v4",
        symbol: sym, side: o.side, qty: o.qty, price: Math.round(o.price * 100) / 100,
        ordType: o.ordType, reason: error ? `${o.reason} — 거부: ${error}` : o.reason,
        dryRun: !live, orderNo,
      });
    } catch (e) {
      log(`⚠ 주문 원장 기록 실패(orderNo=${orderNo || "없음"}) — 중복주문 가드가 이 주문을 `
        + `못 본다: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 국장 2단계(sell 09:30 / buy 15:20)는 하루의 예약을 나눠 적는다 — buy 가 통째로 덮으면
  // sell 의 q75(¾ 익절)가 사라져 다음 날 대사가 그 체결을 q25 로 잘못 읽는다 (#483).
  // 예약은 **발주일 칸**에 쌓는다 (#523). 예전엔 `state.pending` 하나가 "오늘 발주한 것" 과
  // "체결일에 걸려 있던 예약" 두 역할을 겸해서, 대사가 하루 밀리거나(degraded) 창이 이틀
  // 이상이면 둘이 어긋나 T 가 틀어졌다 — 같은 자리에서 세 번 회귀했다(#519 → #521 → 3차 감사).
  // 발주일로 키를 두면 degraded·다중일 창·국장 2단계(sell 09:30 / buy 15:20 이 같은 칸에
  // 쌓인다)가 전부 같은 규칙으로 처리되고, degraded 특수 분기가 필요 없어진다.
  //
  // LOC 는 그날 종가에 체결되므로 발주일 == 체결일(today)이다.
  // degraded 면 매수를 안 내므로 `one`(매수 체결의 T 증분 분모)도 기록하지 않는다 —
  // 낡은 cycleCash 로 계산된 값이라 남기면 거짓이다. 다른 날 칸은 건드리지 않는다.
  if (degraded) pend.one = 0;
  state.pendingByDate = recordPending(state.pendingByDate, today, pend);
  // 왜 '어제'인가: LOC 주문은 그날 종가에 체결돼 체결일 == 실행일(today)이 된다. 대사 필터는
  // `lastRunDate < date < today`(양쪽 strict)라, lastRunDate=today 로 남기면 다음 실행의
  // 창(어제<date<오늘)이 매일 비어 전일 체결이 영영 반영되지 않는다(장부 정지 버그). lastRunDate 를
  // '어제'(= 마지막으로 완전 반영된 날)로 남기면 다음 실행 창이 전일 체결을 포함해 대사가 이어진다.
  // 2단계(sell 09:30 / buy 15:20 동일일)는 sell 이 어제로 올려도 buy 창은 비어 중복반영이 없다.
  if (!degraded) state.lastRunDate = prevMarketDay(today);
  await saveState({ "state.v4": state });

  // 요약은 **접수 수**를 말한다 (#507). 예전엔 `orders.length`(계획 수)라 전량 거부돼도
  // "주문 17건" 으로 성공처럼 보였다.
  // degraded 는 **요약에 드러낸다** (#521). 예전엔 status=done·표기 없음이라, real 에서
  // executions TR 이 지속 실패하면 v4 매수·VR 전량이 영구 정지하는데 대시보드는 매일 done
  // 이었다. 요약은 모니터링 화면과 마감 메일에 그대로 실리는 유일한 한 줄이다.
  const warn = degraded ? " ⚠대사실패(신규 매수 보류)" : "";
  const line = live
    ? `V4 ${sym}[${phase}]: 접수 ${accepted}건/계획 ${orders.length}건`
      + (rejected ? ` · 거부 ${rejected}건` : "")
      + ` (T=${state.t.toFixed(2)} mode=${state.mode} 보유 ${holding})${warn}`
    : `V4 ${sym}[${phase}]: 계획 ${orders.length}건 [DRY-RUN] (T=${state.t.toFixed(2)} `
      + `mode=${state.mode} 보유 ${holding})${warn}`;
  log(line);
  // 낼 게 있었는데 **한 건도 못 냈으면** 사이클을 실패로 만든다 — 그래야 실패 메일이 나가고
  // 모니터링에 남는다. ⚠ dry-run 은 애초에 place() 를 안 부르므로 반드시 live 로 게이트한다
  // (안 그러면 모든 검증 실행이 failed 로 찍히고 #487 재시도까지 붙는다).
  if (live && orders.length > 0 && accepted === 0) {
    // **거부 사유를 분류해서 말한다** (#509). 휴장일이면 조치할 게 없고, 계좌 문제면 사람이
    // 증권사에서 고쳐야 매일 반복이 멈춘다 — 같은 "전량 거부" 라도 할 일이 전혀 다르다.
    const why = summarizeRejects(rejectMsgs);
    const 내역 = Object.entries(why.counts).map(([k, n]) => `${k} ${n}건`).join(" · ");
    const line2 = `${sym}[${phase}]: 주문 ${orders.length}건 전부 거부 — 접수 0건 [${내역}]\n`
      + `${why.advice}\n마지막 사유: ${rejectMsgs[rejectMsgs.length - 1] ?? "(없음)"}`;
    if (!why.needsAction) {
      // 사람이 할 일이 없으면 사이클을 실패로 만들지 않는다 — 휴장일마다 가짜 경보가 쌓이면
      // 진짜 신호가 묻힌다. 로그에는 남겨서 나중에 추적할 수 있게 한다.
      log(`ℹ ${line2}`);
      return line;
    }
    throw new Error(line2);
  }
  return line;
}

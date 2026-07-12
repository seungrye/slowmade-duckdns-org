// 무한매수 V4.0 라이브 엔진 — 파이썬 trading/infinite_v4_engine.py 포팅(KIS 전용,
// 토스는 2단계). 일일 흐름: 대사(전일 체결→T·모드·cycleCash) → 미체결 취소(멱등) →
// 오늘 주문(진입 LOC / normal ¼별지점 LOC+¾목표 지정가+매수 레그 / reverse) → 상태 저장.
//
// phase: 미장 "both"(아침 1회 — 실제 LOC, 종가 조건부 체결) /
//        국장 "sell"(09:30 — ¾ 지정가 매도만) + "buy"(15:20 — 동시호가 지정가 에뮬:
//        현재가(≈종가)가 조건을 만족하는 레그만 전송).
// 상태는 TradingPortfolio.state.v4 에 영속(파이썬 v4-state-*.json 대체).

import TradingOrderLog from "@/models/trading-order-log";
import TradingPortfolio from "@/models/trading-portfolio";
import type { Types } from "mongoose";
import { KisClient, US_ORDER_EXCD, usQuoteExcd } from "./kis-client";
import {
  emptyPending, newV4State, reconcileDay,
  type V4Fill, type V4State,
} from "./infinite-v4-state";
import { marketToday } from "./engines";
import type { CycleLogger } from "./engines";

type Json = Record<string, unknown>;
type Order = {
  side: "buy" | "sell"; qty: number; price: number;
  ordType: "loc" | "limit" | "market"; reason: string;
};

export type V4Config = {
  symbol: string;
  principal: number;
  splits: number; // 20 | 40
  starBase: number; // 별% base(TQQQ 15 / SOXL 20)
  sellTarget: number; // 75% 지정가매도 목표(0.15)
};

const LOOKBACK_DAYS = 14;

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
  client: KisClient,
  phase: "both" | "sell" | "buy",
  log: CycleLogger,
): Promise<string> {
  const market = portfolio.market as "kr" | "us";
  const cfg = parseCfg((portfolio.config ?? {}) as Json);
  const sym = cfg.symbol;
  const live = Boolean(account.liveEnabled) && process.env.TRADING_LIVE_ALLOWED === "true";
  const today = marketToday(market);

  // 잔고 스냅샷(보유·평단) + 현재가
  const [holdings] = market === "kr" ? await client.krAccount() : await client.usAccount();
  const [holding, avg] = holdings[sym] ?? [0, 0];
  const price = market === "kr" ? await client.krPrice(sym) : await client.usPrice(sym, usQuoteExcd(sym));

  // ── 1) 대사 — 마지막 실행일 이후(오늘 제외) 체결을 일자별 적용 ──
  let state = loadState((portfolio.state as Json | undefined)?.v4, cfg);
  const start = state.lastRunDate ||
    new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
  try {
    const execs = market === "kr"
      ? await client.krExecutions(sym, start, today)
      : await client.usExecutions(sym, start, today);
    const fills: (V4Fill & { date: string })[] = [];
    for (const r of execs) {
      const date = String(r.ord_dt ?? "").trim();
      const side = String(r.sll_buy_dvsn_cd ?? "").trim();
      const qty = Number(r.ft_ccld_qty ?? r.ccld_qty ?? r.tot_ccld_qty ?? 0);
      const priceF = Number(r.avg_prvs ?? r.ft_ccld_unpr3 ?? r.avg_unpr ?? r.ccld_unpr ?? 0);
      if (date && ["01", "02"].includes(side) && qty > 0 &&
          state.lastRunDate < date && date < today) {
        fills.push({ date, side: side === "01" ? "sell" : "buy", qty: Math.trunc(qty), price: priceF });
      }
    }
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
    const rows = market === "kr" ? await client.krOpenOrders() : await client.usOpenOrders();
    for (const r of rows) {
      const rowSym = String(r.pdno ?? "");
      if (rowSym !== sym) continue;
      const sideCd = String(r.sll_buy_dvsn_cd ?? "").trim();
      if (phase === "buy" && sideCd !== "02") continue; // 매수(02)만
      const odno = String(r.odno ?? "");
      const qty = Math.trunc(Number(r.nccs_qty ?? r.rmn_qty ?? r.ord_qty ?? 0));
      if (!odno || qty < 1) continue;
      if (!live) {
        log(`[DRY-RUN] 미체결 취소 ODNO=${odno} x${qty}`);
        continue;
      }
      if (market === "kr") await client.krCancelOrder(odno, qty);
      else await client.usCancelOrder(sym, odno, qty, US_ORDER_EXCD[usQuoteExcd(sym)] ?? "NASD");
      log(`미체결 취소 ODNO=${odno} x${qty}`);
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
    const hist = market === "kr"
      ? await client.krHistoryLong(sym, 10)
      : await client.usHistoryLong(sym, usQuoteExcd(sym), 10);
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
    if (live) {
      if (market === "kr") {
        // 국장 에뮬: LOC/지정가 → 지정가, 시장가 → 시장가
        orderNo = await client.krOrder(sym, o.qty, o.side,
          o.ordType === "market" ? { market: true } : { market: false, price: o.price });
      } else {
        const excd = US_ORDER_EXCD[usQuoteExcd(sym)] ?? "NASD";
        const dvsn = o.ordType === "loc" ? "34" : "00"; // 모의는 client 가 지정가 폴백
        orderNo = await client.usOrder(sym, o.qty, o.price, o.side, excd, dvsn);
      }
      log(`주문 접수 ${orderNo} — ${o.side} x${o.qty} @${o.price.toFixed(2)} (${o.ordType})`);
    } else {
      log(`[DRY-RUN] ${o.side} ${sym} x${o.qty} @${o.price.toFixed(2)} (${o.ordType}) — ${o.reason}`);
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

// With 200 cash it places about two rungs around 80 and stops - it never orders beyond the account.
// Laoer's value rebalancing (VR) live engine - keeps a single leveraged ETF within the band (+/-b) of the target path V.
// The account = stock (holding x price) + Pool (the cash ledger). Every cycle (cycleDays), V2 = V1 + Pool/G + CF and the band are recomputed.
//
// Each day a band breach rebalances back to the boundary in one order (below the lower -> buy, above the upper -> sell). The average price is irrelevant (price only).
// One source for backtest and live: the decisions are the pure functions in backtest/value-rebalancing.ts (seedVR,
// advanceCycleVR, applyVRFill, rebalanceShares), used as is. The broker reuses v4's V4Broker adapters
//
// (makeV4KisBroker/makeV4TossBroker) - KIS, Toss, kr and us automatically. State lives in TradingPortfolio.state.vr.
// Live discipline (the same as v4): placing an order does not pre-apply it to the ledger; the next run's reconciliation (executions) does.
// The first entry is "buy the seed, then adopt the holding on the next run", so nothing is double counted. When a
// withdrawal (CF < 0) exceeds the Pool the backtest liquidates automatically, but live clamps the Pool to 0 and only

import TradingOrderLog from "@/models/trading-order-log";
import TradingPortfolio from "@/models/trading-portfolio";
import type { Types } from "mongoose";
import type { ValueRebalancingConfig } from "@/lib/backtest/types";
import {
  advanceCycleVR, applyVRFill, bandOf, seedVR, type VRState, resolveVR } from "@/lib/backtest/value-rebalancing";
import { ladderLot, vrBuyLadder, vrSellLadder } from "@/lib/backtest/vr-ladder";

// warns, for safety (no forced liquidation - the user adds or adjusts funds).
const LADDER_RUNGS = 12;
import { prevMarketDay, type V4Broker } from "./infinite-v4-engine";
import { marketToday, type CycleLogger } from "./engines";
import { formatMoney } from "@/lib/format";

type Json = Record<string, unknown>;

const LOOKBACK_DAYS = 14;

export type VRLiveConfig = ValueRebalancingConfig & { symbol: string };

/** The most rungs to place on one side of the ladder. The source says 6-11, and this also accounts for the rate limit (at least 1s per call). */
type VRPersist = VRState & { symbol: string; vInit: boolean; lastRunDate: string };

export function parseVRCfg(config: Json): VRLiveConfig {
  const symbol = String(config.symbol ?? "");
  if (!symbol) throw new Error("value_rebalancing config 에 symbol 필요");
  const principal = Number(config.principal ?? 0);
  if (!(principal > 0)) throw new Error("value_rebalancing config 에 principal(양수) 필요");
  /** The persisted state = the VR ledger (VRState) plus the symbol, the initialised flag and the last run date. Stored in TradingPortfolio.state.vr. */
  // G and the Pool cap are **derived from the operating mode when unset** (source 7.1 - accumulating 10/75%, lump-sum
  // 10/50%, withdrawing 20/25%). Previously gradient was required and the cap was always 0.5, so an accumulating
  const gradient = Number(config.gradient ?? 0);
  return {
    symbol, principal,
    ...(gradient > 0 ? { gradient } : {}),
    bandPct: Number(config.bandPct ?? 0.15),
    ...(Number(config.poolLimitPct) > 0 ? { poolLimitPct: Number(config.poolLimitPct) } : {}),
    cycleDays: Math.max(1, Math.floor(Number(config.cycleDays ?? 10))),
    ...(config.initStockRatio != null ? { initStockRatio: Number(config.initStockRatio) } : {}),
    ...(config.cashflow != null ? { cashflow: Number(config.cashflow) } : {}),
    ...(config.feeRate != null ? { feeRate: Number(config.feeRate) } : {}),
  };
}

function loadState(raw: unknown): VRPersist | null {
  const v = (raw ?? {}) as Partial<VRPersist>;
  if (v.vInit && typeof v.pool === "number" && typeof v.V === "number") return v as VRPersist;
  return null; // setup could run on the lump-sum cap (#345).
}

// uninitialised - needs a seed or adoption
export async function runValueRebalancing(
  account: { _id: Types.ObjectId; envKey: string; liveEnabled?: boolean | null },
  portfolio: { _id: Types.ObjectId; market: string; strategy: string; config: unknown; state?: unknown },
  runId: Types.ObjectId,
  broker: V4Broker,
  log: CycleLogger,
): Promise<string> {
  const market = portfolio.market as "kr" | "us";
  const cfg = parseVRCfg((portfolio.config ?? {}) as Json);
  const sym = cfg.symbol;
  const fee = cfg.feeRate && cfg.feeRate > 0 ? cfg.feeRate : 0;
  const b = cfg.bandPct;
  const cycleDays = cfg.cycleDays;
  const live = Boolean(account.liveEnabled) && process.env.TRADING_LIVE_ALLOWED === "true";
  const today = marketToday(market);

  const { holding, price, cash } = await broker.snapshot(sym);
  if (!(price > 0)) throw new Error(`VR ${sym}: 현재가 조회 실패`);

  const orders: { side: "buy" | "sell"; qty: number; price: number; reason: string; ordType?: "loc" | "limit" }[] = [];
  let persisted = loadState((portfolio.state as Json | undefined)?.vr);

  /** One VR live cycle, returning a summary string (failures throw). broker is v4's V4Broker adapter. */
  if (!persisted) {
    if (holding > 0) {
      const stockVal = holding * price;
      const pool = Math.max(0, cfg.principal - stockVal);
      const st: VRState = {
        qty: holding, pool, V: stockVal, buyBudget: resolveVR(cfg).poolLimitPct * pool,
        sinceCycle: 0, cumBuy: stockVal, cumSell: 0,
      };
      persisted = { ...st, symbol: sym, vInit: true, lastRunDate: prevMarketDay(today) };
      log(`[vr:${sym}] 기존 보유 ${holding} 채택 → V=${formatMoney(stockVal, market)} Pool=${formatMoney(pool, market)}`);
      // 채택 즉시 아래 리밸런스 진행
    } else {
      const seeded = seedVR(cfg, price);
      if (seeded.qty >= 1) {
        orders.push({ side: "buy", qty: seeded.qty, price: price * 1.1, reason: `VR 시드 매수(${Math.round((cfg.initStockRatio ?? 0.85) * 100)}% 진입)` });
      }
      await sendOrders(orders, broker, { account, runId, market, sym, live, log });
      // ── Uninitialised: adopt an existing holding, or buy the seed and adopt it on the next run ──
      await TradingPortfolio.updateOne({ _id: portfolio._id },
        { $set: { "state.vr": { symbol: sym, vInit: false, lastRunDate: today } } });
      const line = `VR ${sym}: 시드 매수 ${seeded.qty}주 발주(체결 후 다음 실행에서 채택)`;
      log(line);
      return line;
    }
  }

  // Only the seed order goes out; the fill (holding > 0) is adopted on the next run. The state stays uninitialised.
  let state: VRState = {
    qty: persisted.qty, pool: persisted.pool, V: persisted.V, buyBudget: persisted.buyBudget,
    sinceCycle: persisted.sinceCycle, cumBuy: persisted.cumBuy, cumSell: persisted.cumSell,
  };
  const start = persisted.lastRunDate ||
    new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
  try {
    const fills = (await broker.executions(sym, start, today))
      .filter((f) => persisted!.lastRunDate < f.date && f.date < today);
    for (const f of fills) {
      state = applyVRFill(state, { side: f.side, qty: f.qty, price: f.price }, fee);
      log(`[vr:${sym}] ${f.date} 체결 반영: ${f.side} ${f.qty}@${formatMoney(f.price, market)} → Pool=${formatMoney(state.pool, market)}`);
    }
  } catch (e) {
    log(`[vr:${sym}] 체결 반영 실패 → 상태 유지: ${e instanceof Error ? e.message : e}`);
  }
  state.qty = holding; // ── Reconcile: apply fills since the last run date (today excluded) to the Pool ledger ──

  // The broker is the source of truth for the holding - synced in case reconciliation missed something
  state.sinceCycle += 1;
  if (state.sinceCycle >= cycleDays) {
    const cf = cfg.cashflow ?? 0;
    if (cf < 0 && state.pool + cf < 0) {
      log(`[vr:${sym}] ⚠ 인출 ${formatMoney(cf, market)} 이 Pool(${formatMoney(state.pool, market)})로 부족 — Pool 0 클램프(자동청산 안 함, 자금 보충 필요)`);
    }
    // ── Cycle boundary: refresh V and reset the band and budget (live clamps the Pool instead of auto-liquidating a withdrawal) ──
    state = advanceCycleVR(state, cfg, price);
    log(`[vr:${sym}] 사이클 경계: V→${formatMoney(state.V, market)} Pool→${formatMoney(state.pool, market)} 매수예산→${formatMoney(state.buyBudget, market)}`);
  }

  // The performance formula looks at the valuation (qty x price) at the cycle's end (#358).
  //
  // ── A one-share limit ladder against the band boundaries (#360) ──
  // Previously only one order went out near the close, which missed every intraday move that brushed the band and
  // came back. The source places one-share limits against the band boundaries - one rung at each price where the
  const band = bandOf(state.V, b);

  // valuation lands exactly on a boundary.
  // Old orders are cleared first (cancel-then-repost, as in v4). The band is recomputed daily, so yesterday's ladder
  try {
    const open = await broker.openOrders(sym);
    for (const o of open) {
      await broker.cancel(sym, o.orderNo, o.qty);
      log(`[vr:${sym}] 묵은 주문 취소 ${o.orderNo} x${o.qty}`);
    }
  } catch (e) {
    log(`[vr:${sym}] ⚠ 미체결 조회/취소 실패 — 주문은 계속: ${e instanceof Error ? e.message : e}`);
  }

  // has the wrong prices. A failed query is swallowed and it continues - failing to clear is no reason to skip today's orders.
  const lot = ladderLot({ low: band.low, qty: state.qty, budget: Math.min(state.buyBudget, state.pool, cash), maxRungs: LADDER_RUNGS });
  const 현금캡 = Math.max(0, cash);
  let 쓸현금 = 현금캡;

  for (const r of vrBuyLadder({ low: band.low, qty: state.qty, pool: state.pool, budget: state.buyBudget, lot, maxRungs: LADDER_RUNGS })) {
    const 대금 = r.price * lot * (1 + fee);
    if (대금 > 쓸현금) break;   // Shares per rung - decided by how many rungs are needed. At the source's scale (tens of shares) it stays one each.
    쓸현금 -= 대금;
    orders.push({ side: "buy", qty: lot, price: r.price, ordType: "limit",
      reason: `VR 사다리 매수 ${r.qtyAfter}주째(밴드하단 ${formatMoney(band.low, market)})` });
  }
  for (const r of vrSellLadder({ high: band.high, qty: state.qty, pool: state.pool, lot }).slice(0, LADDER_RUNGS)) {
    orders.push({ side: "sell", qty: lot, price: r.price, ordType: "limit",
      reason: `VR 사다리 매도 ${r.qtyAfter}주째(밴드상단 ${formatMoney(band.high, market)})` });
  }

  await sendOrders(orders, broker, { account, runId, market, sym, live, log });

  // cap by the real account cash (safe on a shared account)
  const persist: VRPersist = { ...state, symbol: sym, vInit: true, lastRunDate: prevMarketDay(today) };
  await TradingPortfolio.updateOne({ _id: portfolio._id }, { $set: { "state.vr": persist } });

  const line = `VR ${sym}: 주문 ${orders.length}건 (V=${formatMoney(state.V, market)} 밴드[${formatMoney(band.low, market)},${formatMoney(band.high, market)}] 보유 ${holding} Pool ${formatMoney(state.pool, market)})`;
  log(line);
  return line;
}

// ── Save the state - lastRunDate is left at 'yesterday' so the next run reconciles today's LOC fills (the same window as v4) ──
async function sendOrders(
  orders: { side: "buy" | "sell"; qty: number; price: number; reason: string; ordType?: "loc" | "limit" }[],
  broker: V4Broker,
  ctx: {
    account: { _id: Types.ObjectId; envKey: string };
    runId: Types.ObjectId; market: "kr" | "us"; sym: string; live: boolean; log: CycleLogger;
  },
): Promise<void> {
  for (const o of orders) {
    let orderNo = "";
    try {
      if (ctx.live) {
        const 형식 = o.ordType ?? "loc";
        orderNo = await broker.place(ctx.sym, { side: o.side, qty: o.qty, price: o.price, ordType: 형식, reason: o.reason });
        ctx.log(`주문 접수 ${orderNo} — ${o.side} x${o.qty} @${formatMoney(o.price, ctx.market)} (${형식})`);
      } else {
        ctx.log(`[DRY-RUN] ${o.side} ${ctx.sym} x${o.qty} @${formatMoney(o.price, ctx.market)} (${o.ordType ?? "loc"}) — ${o.reason}`);
      }
    } catch (e) {
      ctx.log(`주문 실패(${o.side} x${o.qty} @${formatMoney(o.price, ctx.market)}) — 다음 주문 계속: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    await TradingOrderLog.create({
      accountId: ctx.account._id, runId: ctx.runId, envKey: ctx.account.envKey,
      market: ctx.market, strategy: "value_rebalancing",
      symbol: ctx.sym, side: o.side, qty: o.qty, price: Math.round(o.price * 100) / 100,
      ordType: o.ordType ?? "loc", reason: o.reason, dryRun: !ctx.live, orderNo,
    });
  }
}

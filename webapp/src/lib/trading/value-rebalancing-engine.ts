// 라오어 밸류리밸런싱(VR) 라이브 엔진 — 단일 레버리지 ETF를 목표경로 V의 밴드(±b) 안으로 유지.
// 계좌 = 주식(보유×가격) + Pool(현금 장부). 사이클(cycleDays)마다 V₂=V₁+Pool/G+CF·밴드 재계산.
// 매일 밴드 이탈 시 밴드 경계까지 리밸런스(하단↓→매수·상단↑→매도) 1건. 평단 무관(가격만).
//
// 백테스트=라이브 단일 소스: 결정 로직은 backtest/value-rebalancing.ts 의 순수 함수(seedVR·
// advanceCycleVR·applyVRFill·rebalanceShares)를 그대로 쓴다. 브로커는 v4 의 V4Broker 어댑터
// (makeV4KisBroker/makeV4TossBroker)를 재사용 — KIS·토스·kr·us 자동. 상태는 TradingPortfolio.state.vr.
//
// 라이브 규율(v4 와 동일): 발주는 장부에 사전적용하지 않고, 다음 실행의 대사(executions)로 반영한다.
// 첫 진입은 "시드 매수 후 다음 실행에서 보유를 채택"하는 방식이라 이중계상이 없다. 인출(CF<0)이
// Pool 로 부족할 때 백테스트는 자동 청산하지만, 라이브는 안전을 위해 Pool 을 0 으로 클램프하고 경고만
// 남긴다(강제 청산 없음 — 사용자가 자금 보충/조정).

import TradingOrderLog from "@/models/trading-order-log";
import TradingPortfolio from "@/models/trading-portfolio";
import type { Types } from "mongoose";
import type { ValueRebalancingConfig } from "@/lib/backtest/types";
import {
  advanceCycleVR, applyVRFill, bandOf, rebalanceShares, seedVR, type VRState,
} from "@/lib/backtest/value-rebalancing";
import { prevMarketDay, type V4Broker } from "./infinite-v4-engine";
import { marketToday, type CycleLogger } from "./engines";

type Json = Record<string, unknown>;

const LOOKBACK_DAYS = 14;

export type VRLiveConfig = ValueRebalancingConfig & { symbol: string };

/** 영속 상태 = VR 장부(VRState) + 종목·초기화 플래그·마지막 실행일. TradingPortfolio.state.vr 에 저장. */
type VRPersist = VRState & { symbol: string; vInit: boolean; lastRunDate: string };

export function parseVRCfg(config: Json): VRLiveConfig {
  const symbol = String(config.symbol ?? "");
  if (!symbol) throw new Error("value_rebalancing config 에 symbol 필요");
  const principal = Number(config.principal ?? 0);
  if (!(principal > 0)) throw new Error("value_rebalancing config 에 principal(양수) 필요");
  const gradient = Number(config.gradient ?? 0);
  if (!(gradient > 0)) throw new Error("value_rebalancing config 에 gradient(양수) 필요");
  return {
    symbol, principal, gradient,
    bandPct: Number(config.bandPct ?? 0.15),
    poolLimitPct: Number(config.poolLimitPct ?? 0.5),
    cycleDays: Math.max(1, Math.floor(Number(config.cycleDays ?? 10))),
    ...(config.initStockRatio != null ? { initStockRatio: Number(config.initStockRatio) } : {}),
    ...(config.cashflow != null ? { cashflow: Number(config.cashflow) } : {}),
    ...(config.feeRate != null ? { feeRate: Number(config.feeRate) } : {}),
  };
}

function loadState(raw: unknown): VRPersist | null {
  const v = (raw ?? {}) as Partial<VRPersist>;
  if (v.vInit && typeof v.pool === "number" && typeof v.V === "number") return v as VRPersist;
  return null; // 미초기화 — 시드/채택 필요
}

/** VR 라이브 사이클 1회. 요약 문자열 반환(실패는 throw). broker 는 v4 의 V4Broker 어댑터. */
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

  const orders: { side: "buy" | "sell"; qty: number; price: number; reason: string }[] = [];
  let persisted = loadState((portfolio.state as Json | undefined)?.vr);

  // ── 미초기화: 보유가 있으면 채택, 없으면 시드 매수 후 다음 실행에서 채택 ──
  if (!persisted) {
    if (holding > 0) {
      const stockVal = holding * price;
      const pool = Math.max(0, cfg.principal - stockVal);
      const st: VRState = {
        qty: holding, pool, V: stockVal, buyBudget: cfg.poolLimitPct * pool,
        sinceCycle: 0, cumBuy: stockVal, cumSell: 0,
      };
      persisted = { ...st, symbol: sym, vInit: true, lastRunDate: prevMarketDay(today) };
      log(`[vr:${sym}] 기존 보유 ${holding} 채택 → V=${stockVal.toFixed(0)} Pool=${pool.toFixed(0)}`);
      // 채택 즉시 아래 리밸런스 진행
    } else {
      const seeded = seedVR(cfg, price);
      if (seeded.qty >= 1) {
        orders.push({ side: "buy", qty: seeded.qty, price: price * 1.1, reason: `VR 시드 매수(${Math.round((cfg.initStockRatio ?? 0.85) * 100)}% 진입)` });
      }
      await sendOrders(orders, broker, { account, runId, market, sym, live, log });
      // 시드 발주만 하고, 체결(보유>0)은 다음 실행에서 채택. 상태는 미초기화로 유지.
      await TradingPortfolio.updateOne({ _id: portfolio._id },
        { $set: { "state.vr": { symbol: sym, vInit: false, lastRunDate: today } } });
      const line = `VR ${sym}: 시드 매수 ${seeded.qty}주 발주(체결 후 다음 실행에서 채택)`;
      log(line);
      return line;
    }
  }

  // ── 대사: 마지막 실행일 이후(오늘 제외) 체결을 Pool 장부에 반영 ──
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
      log(`[vr:${sym}] ${f.date} 대사: ${f.side} ${f.qty}@${f.price} → Pool=${state.pool.toFixed(0)}`);
    }
  } catch (e) {
    log(`[vr:${sym}] 체결 대사 실패 → 상태 유지: ${e instanceof Error ? e.message : e}`);
  }
  state.qty = holding; // 보유수량은 브로커가 진실원 — 대사 누락 대비 동기화

  // ── 사이클 경계: V 갱신 + 밴드/예산 리셋(라이브는 인출 자동청산 대신 Pool 클램프) ──
  state.sinceCycle += 1;
  if (state.sinceCycle >= cycleDays) {
    const cf = cfg.cashflow ?? 0;
    if (cf < 0 && state.pool + cf < 0) {
      log(`[vr:${sym}] ⚠ 인출 ${cf} 이 Pool(${state.pool.toFixed(0)})로 부족 — Pool 0 클램프(자동청산 안 함, 자금 보충 필요)`);
    }
    state = advanceCycleVR(state, cfg);
    log(`[vr:${sym}] 사이클 경계: V→${state.V.toFixed(0)} Pool→${state.pool.toFixed(0)} 매수예산→${state.buyBudget.toFixed(0)}`);
  }

  // ── 오늘 밴드 판정 → 델타 1건 ──
  const band = bandOf(state.V, b);
  let delta = rebalanceShares({ qty: state.qty, price, low: band.low, high: band.high, buyBudget: state.buyBudget, pool: state.pool, fee });
  if (delta > 0) {
    const byCash = Math.floor(cash / (price * (1 + fee))); // 실계좌 현금 캡(공유 계좌 안전)
    delta = Math.min(delta, byCash);
    if (delta > 0) orders.push({ side: "buy", qty: delta, price: price * 1.1, reason: `VR 밴드하단 매수(V=${state.V.toFixed(0)})` });
  } else if (delta < 0) {
    orders.push({ side: "sell", qty: -delta, price: price * 0.9, reason: `VR 밴드상단 매도(V=${state.V.toFixed(0)})` });
  }

  await sendOrders(orders, broker, { account, runId, market, sym, live, log });

  // ── 상태 저장 — lastRunDate='어제'로 남겨 오늘 LOC 체결을 다음 실행이 대사(v4 와 동일 창) ──
  const persist: VRPersist = { ...state, symbol: sym, vInit: true, lastRunDate: prevMarketDay(today) };
  await TradingPortfolio.updateOne({ _id: portfolio._id }, { $set: { "state.vr": persist } });

  const line = `VR ${sym}: 주문 ${orders.length}건 (V=${state.V.toFixed(0)} 밴드[${band.low.toFixed(0)},${band.high.toFixed(0)}] 보유 ${holding} Pool ${state.pool.toFixed(0)})`;
  log(line);
  return line;
}

/** 주문 전송(LOC, dry-run 게이트) + 원장 기록. 주문 단위 격리(한 건 실패가 나머지·상태저장을 안 막게). */
async function sendOrders(
  orders: { side: "buy" | "sell"; qty: number; price: number; reason: string }[],
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
        orderNo = await broker.place(ctx.sym, { side: o.side, qty: o.qty, price: o.price, ordType: "loc", reason: o.reason });
        ctx.log(`주문 접수 ${orderNo} — ${o.side} x${o.qty} @${o.price.toFixed(2)} (loc)`);
      } else {
        ctx.log(`[DRY-RUN] ${o.side} ${ctx.sym} x${o.qty} @${o.price.toFixed(2)} (loc) — ${o.reason}`);
      }
    } catch (e) {
      ctx.log(`주문 실패(${o.side} x${o.qty} @${o.price.toFixed(2)}) — 다음 주문 계속: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    await TradingOrderLog.create({
      accountId: ctx.account._id, runId: ctx.runId, envKey: ctx.account.envKey,
      market: ctx.market, strategy: "value_rebalancing",
      symbol: ctx.sym, side: o.side, qty: o.qty, price: Math.round(o.price * 100) / 100,
      ordType: "loc", reason: o.reason, dryRun: !ctx.live, orderNo,
    });
  }
}

// 라이브 매매 엔진 — 파이썬 trading/{regime_engine,trend_engine}.py 의 1단계 포팅.
//
// 한 사이클 = 한 포트폴리오 블록(계정×시장×전략)의 "오늘 결정 + 주문". open 방식
// (전일까지의 신호 → 아침 시장가)이며, 주문은 기본 dry-run(TradingOrderLog 에만 기록).
// 실주문은 계정 liveEnabled && 서버 TRADING_LIVE_ALLOWED=true 이중 게이트.
// rotation 재평가일·자동선발 풀은 TradingPortfolio.state 에 영속(파이썬 rotation-state 대응).

import { KR_SEED, US_SEED, liquidityMetric, selectPool, type SeedEntry } from "@/lib/backtest/rotation-pool";
import { clampBuyQty } from "./buyable";
import { topUpQty } from "./topup";
import { decryptSecret } from "./crypto";
import { KisClient, US_ORDER_EXCD, registerUsExcd, usQuoteExcd } from "./kis-client";
import { lrsDecide, rotationDecide, trendDecide, type OrderIntent } from "./strategies";
import { TossClient } from "./toss-client";
import { UNIVERSES, EXCD_MAPS } from "./universes";
import TradingOrderLog from "@/models/trading-order-log";
import TradingPortfolio from "@/models/trading-portfolio";
import { formatMoney } from "@/lib/format";
import type { TradingAccountType } from "@/models/trading-account";
import type { TradingPortfolioType } from "@/models/trading-portfolio";
import type { Types } from "mongoose";

type AccountDoc = TradingAccountType & { _id: Types.ObjectId };
type PortfolioDoc = TradingPortfolioType & { _id: Types.ObjectId };
type Cfg = Record<string, unknown>;
export type CycleLogger = (line: string) => void;

// ── 브로커 추상화(파이썬 TrendBroker 인터페이스 대응) ─────────────

export type LiveBroker = {
  market: "kr" | "us";
  account(): Promise<[Record<string, [number, number]>, number, number]>; // [보유, 현금, 증권사 평가금액]
  priceOf(symbol: string): Promise<number>;
  historyLong(symbol: string, need?: number): Promise<[string, number][]>;
  valueSeries(symbol: string): Promise<number[]>;
  submit(symbol: string, qty: number, side: "buy" | "sell", price: number): Promise<string>;
  // 종목·가격의 매수가능수량(수수료·환율 반영). KIS=psamount 권위값(max_ord_psbl_qty/
  // nrcvb_buy_qty), 토스=매수여력/수수료율 계산. 전량매수(rotation/LRS)가 주문가능금액을
  // 넘겨 거부되는 것을 막는다("현금 관리" — 총액이 아닌 실제 주문가능수량으로 사이징).
  buyableQty(symbol: string, price: number): Promise<number>;
};

function creds(account: AccountDoc): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries((account.credentials ?? {}) as Record<string, string>)) {
    out[k] = decryptSecret(v);
  }
  return out;
}

export function makeTossClient(account: AccountDoc): TossClient {
  const c = creds(account);
  return new TossClient({
    clientId: c.clientId,
    clientSecret: c.clientSecret,
    accountSeq: c.accountSeq ? Number(c.accountSeq) : null,
  });
}

export function makeKisClient(account: AccountDoc): KisClient {
  const c = creds(account);
  return new KisClient({
    env: account.env === "real" ? "real" : "paper",
    appKey: c.appKey,
    appSecret: c.appSecret,
    accountNo: c.accountNo,
  });
}

export function makeBroker(account: AccountDoc, market: "kr" | "us"): LiveBroker {
  if (account.broker === "toss") {
    const client = makeTossClient(account);
    return {
      market,
      account: () => client.account(market),
      priceOf: (s) => client.price(s),
      historyLong: (s, need = 210) => client.historyLong(s, need),
      valueSeries: (s) => client.valueSeries(s),
      submit: (s, qty, side) => client.orderMarket(s, qty, side),
      buyableQty: (s, price) => client.buyableQty(s, price, market),
    };
  }
  const client = makeKisClient(account);
  if (market === "kr") {
    return {
      market,
      account: () => client.krAccount(),
      priceOf: (s) => client.krPrice(s),
      historyLong: (s, need = 210) => client.krHistoryLong(s, need),
      valueSeries: (s) => client.krValueSeries(s),
      submit: (s, qty, side) => client.krOrderMarket(s, qty, side),
      buyableQty: (s, price) => client.krBuyableQty(s, price),
    };
  }
  return {
    market,
    account: () => client.usAccount(),
    priceOf: (s) => client.usPrice(s, usQuoteExcd(s)),
    historyLong: (s, need = 210) => client.usHistoryLong(s, usQuoteExcd(s), need),
    valueSeries: (s) => client.usValueSeries(s, usQuoteExcd(s)),
    // KIS 미국 시장가는 모의 미지원 → 현재가 지정가(파이썬 OverseasTrendBroker.submit 동일)
    submit: (s, qty, side, price) =>
      client.usOrder(s, qty, price, side, US_ORDER_EXCD[usQuoteExcd(s)] ?? "NASD"),
    buyableQty: (s, price) => client.usBuyableQty(s, price, US_ORDER_EXCD[usQuoteExcd(s)] ?? "NASD"),
  };
}

/** 시장 tz 의 오늘(YYYYMMDD) — '오늘 미완성 봉 제외'(open 방식) 판정용. */
export function marketToday(market: "kr" | "us", now = new Date()): string {
  const tz = market === "kr" ? "Asia/Seoul" : "America/New_York";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now).replace(/-/g, "");
}

// ── 주문 실행(로그 + 이중 게이트) ────────────────────────────────

async function execute(
  account: AccountDoc, portfolio: PortfolioDoc, runId: Types.ObjectId,
  intents: OrderIntent[], broker: LiveBroker, log: CycleLogger,
): Promise<{ executed: number; live: boolean }> {
  const live = Boolean(account.liveEnabled) && process.env.TRADING_LIVE_ALLOWED === "true";
  let executed = 0;
  for (const it of intents) {
    // 주문 단위 격리 — 한 종목의 주문 거부가 나머지(특히 trend 유니버스)를 죽이지 않게.
    try {
      let orderNo = "";
      if (live) {
        orderNo = await broker.submit(it.symbol, it.qty, it.side, it.price);
        log(`주문 접수 ${orderNo} — ${it.side} ${it.symbol} x${it.qty}`);
        // 매매기록(stocktrades)은 주문 시점이 아니라 **장 마감 sync 의 실제 체결내역**으로
        // 기록한다(정확한 체결가·수량). 여기서 즉시 기록하지 않는다.
      } else {
        log(`[DRY-RUN] ${it.side} ${it.symbol} x${it.qty} @${formatMoney(it.price, broker.market)} — ${it.reason}`);
      }
      await TradingOrderLog.create({
        accountId: account._id, runId, envKey: account.envKey,
        market: portfolio.market, strategy: portfolio.strategy,
        symbol: it.symbol, side: it.side, qty: it.qty, price: it.price,
        ordType: "market", reason: it.reason, dryRun: !live, orderNo,
      });
      executed++;
    } catch (e) {
      log(`[${it.symbol}] 주문 실패 — 다음 주문 계속: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { executed, live };
}

// ── 전략별 사이클 ────────────────────────────────────────────────

async function runLrs(
  account: AccountDoc, p: PortfolioDoc, runId: Types.ObjectId, broker: LiveBroker, log: CycleLogger,
): Promise<string> {
  const cfg = p.config as Cfg;
  const signal = String(cfg.signal ?? (p.market === "kr" ? "069500" : "QQQ"));
  const target = String(cfg.target ?? (p.market === "kr" ? "122630" : "TQQQ"));
  const sma = Number(cfg.sma ?? 200);
  const today = marketToday(p.market);
  const hist = (await broker.historyLong(signal, sma + 10))
    .filter(([d]) => d !== today).map(([, c]) => c);
  const [holdings, cash] = await broker.account();
  const [qty, avg] = holdings[target] ?? [0, 0];
  const price = await broker.priceOf(target);
  const intents = lrsDecide({
    signalCloses: hist, target, price, holdingQty: qty, avgPrice: avg, cash,
    smaPeriod: sma, bandPct: Number(cfg.band ?? 1) / 100,
  });
  if (!intents.length) log(`[LRS ${target}] 신호 없음(레짐 유지) — 보유 ${qty}주`);
  // 전량매수(LRS)도 매수가능수량으로 클램프 — lrsDecide 는 floor(현금/가격) 총액 기준이라
  // KIS 한도 초과로 거부될 수 있다(rotation 과 동일 원인). 매도는 그대로.
  const sized: OrderIntent[] = [];
  for (const it of intents) {
    if (it.side !== "buy") { sized.push(it); continue; }
    const maxQ = it.price > 0 ? await broker.buyableQty(it.symbol, it.price) : 0;
    const q = clampBuyQty(it.qty, maxQ);
    if (q < 1) { log(`[LRS ${it.symbol}] 매수가능수량 0 — 매수 보류(가격 ${formatMoney(it.price, broker.market)})`); continue; }
    if (q !== it.qty) log(`[LRS ${it.symbol}] 매수수량 ${it.qty}→${q} 클램프(매수가능수량)`);
    sized.push({ ...it, qty: q });
  }
  // 유휴현금 top-up(현금 드래그 제거) — 보유 & 레짐 유지(매도 신호 없음)이면 남는 현금을 target 에 추가 투입.
  if (cfg.reinvestIdleCash !== false && qty > 0 && !sized.some((i) => i.side === "sell")) {
    const bq = price > 0 ? await broker.buyableQty(target, price) : 0;
    const q = topUpQty({ targetNotional: cash + qty * price, currentNotional: qty * price, price, buyableQty: bq });
    if (q >= 1) {
      sized.push({ side: "buy", symbol: target, qty: q, price, reason: `유휴현금 추가 투입(${q}주)` });
      log(`[LRS ${target}] 유휴현금 추가 투입 — ${q}주(레짐 유지)`);
    }
  }
  const { executed } = await execute(account, p, runId, sized, broker, log);
  return `LRS ${target}: 신호 ${executed}건`;
}

async function runRotation(
  account: AccountDoc, p: PortfolioDoc, runId: Types.ObjectId, broker: LiveBroker, log: CycleLogger,
): Promise<string> {
  const cfg = p.config as Cfg;
  const signal = String(cfg.signal ?? (p.market === "kr" ? "069500" : "QQQ"));
  const sma = Number(cfg.sma ?? 200);
  const mom = Number(cfg.mom ?? 126);
  const reb = Number(cfg.rebalance ?? 63);
  const manual = Array.isArray(cfg.candidates) && (cfg.candidates as string[]).length >= 2
    ? (cfg.candidates as string[]) : null;
  const seeds: SeedEntry[] = p.market === "kr" ? KR_SEED : US_SEED;
  const candidates = manual ?? seeds.map((s) => s.ticker);
  const today = marketToday(p.market);

  const sigRows = (await broker.historyLong(signal, sma + 10)).filter(([d]) => d !== today);
  const sigCloses = sigRows.map(([, c]) => c);
  const [holdings, cash0] = await broker.account();
  let cash = cash0;
  const holding = candidates.find((c) => (holdings[c]?.[0] ?? 0) > 0) ?? null;

  const state = (p.state ?? {}) as Cfg;
  const last = state.lastRebalance ? String(state.lastRebalance) : null;
  const daysSince = last ? sigRows.filter(([d]) => d > last).length : reb;

  // 자동선발 풀 — 파이썬 RotationEngine._ensure_pool 동일 규칙(구성 변경만 갱신·공지).
  let pool = manual;
  if (!manual) {
    const saved = Array.isArray(state.autoPool) ? (state.autoPool as string[]) : [];
    if (saved.length && holding !== null && daysSince < reb) {
      pool = saved;
      log(`[rotation] 후보 자동선발 모드 — 풀 유지: ${saved.join(",")}`);
    } else {
      const metrics: Record<string, number | null> = {};
      for (const s of seeds) {
        try {
          metrics[s.ticker] = liquidityMetric(await broker.valueSeries(s.ticker), 20);
        } catch {
          metrics[s.ticker] = null;
        }
      }
      const newPool = selectPool(seeds, metrics, 4);
      const changed = !saved.length ||
        newPool.length !== saved.length || !newPool.every((t) => saved.includes(t));
      if (changed && saved.length) log(`ℹ 로테이션 후보 자동갱신: ${saved.join(",")} → ${newPool.join(",")}`);
      else log(`[rotation] 후보 자동선발${saved.length ? " — 구성 유지" : "(초기)"}: ${newPool.join(",")}`);
      pool = changed ? newPool : saved;
      if (changed) {
        await TradingPortfolio.updateOne({ _id: p._id }, { $set: { "state.autoPool": newPool } });
      }
    }
  }

  const candCloses: Record<string, number[]> = {};
  for (const c of pool ?? []) {
    candCloses[c] = (await broker.historyLong(c, mom + 10))
      .filter(([d]) => d !== today).map(([, x]) => x);
  }
  const d = rotationDecide({
    candidates, signalCloses: sigCloses, candCloses, holding, daysSinceRebalance: daysSince,
    smaPeriod: sma, bandPct: Number(cfg.band ?? 1) / 100, momDays: mom, rebalanceDays: reb,
  });
  log(`[rotation] ${d.reason} (보유 ${holding ?? "현금"} · 경과 ${daysSince}일)`);

  const intents: OrderIntent[] = [];
  if (d.action === "cash" && holding) {
    const [q] = holdings[holding];
    intents.push({ side: "sell", symbol: holding, qty: q,
                   price: await broker.priceOf(holding), reason: d.reason });
  } else if (d.action === "switch" && d.target) {
    if (holding && holding !== d.target) {
      const [q] = holdings[holding];
      const sellPrice = await broker.priceOf(holding);
      intents.push({ side: "sell", symbol: holding, qty: q, price: sellPrice, reason: d.reason });
      cash += q * sellPrice; // 시장가 매도 대금 근사(같은 날 재진입)
    }
    if (holding !== d.target) {
      const price = await broker.priceOf(d.target);
      // 수량은 매수가능수량(수수료·환율 반영)으로 — floor(현금/가격)은 총액이라 KIS 한도를
      // 넘겨 40250000(주문가능금액 부족)로 거부된다(레버리지 ETF 등 특히). 스위치 당일 미정산
      // 매도대금은 아직 반영 안 되므로 그날 덜 담고 다음 사이클에 마저 진입(안전).
      const q = price > 0 ? await broker.buyableQty(d.target, price) : 0;
      if (q >= 1) intents.push({ side: "buy", symbol: d.target, qty: q, price, reason: d.reason });
      else log(`[rotation] 매수가능수량 0 — ${d.target} 진입 보류(현금 ${formatMoney(cash, broker.market)}, 가격 ${formatMoney(price, broker.market)})`);
    }
  } else if (d.action === "hold" && holding && d.regimeOn && cfg.reinvestIdleCash !== false) {
    // 유휴현금 top-up(현금 드래그 제거) — 보유 & 레짐 유지일 때 남는 현금(입금·미정산 정산분)을 보유 종목에 투입.
    const price = await broker.priceOf(holding);
    const [hq] = holdings[holding];
    const bq = price > 0 ? await broker.buyableQty(holding, price) : 0;
    const q = topUpQty({ targetNotional: cash + hq * price, currentNotional: hq * price, price, buyableQty: bq });
    if (q >= 1) {
      intents.push({ side: "buy", symbol: holding, qty: q, price, reason: `유휴현금 추가 투입(${q}주)` });
      log(`[rotation] 유휴현금 추가 투입 — ${holding} ${q}주(레짐 유지)`);
    }
  }
  const { executed } = await execute(account, p, runId, intents, broker, log);
  if (d.rebalanced) {
    await TradingPortfolio.updateOne({ _id: p._id }, { $set: { "state.lastRebalance": today } });
  }
  return `rotation: ${d.action} · 신호 ${executed}건`;
}

async function runTrend(
  account: AccountDoc, p: PortfolioDoc, runId: Types.ObjectId, broker: LiveBroker, log: CycleLogger,
): Promise<string> {
  const cfg = p.config as Cfg;
  // universeRef(명명 유니버스) 우선, 없으면 인라인 universe(하위호환).
  const ref = typeof cfg.universeRef === "string" ? cfg.universeRef : null;
  const universe = ref ? (UNIVERSES[ref] ?? []) : (Array.isArray(cfg.universe) ? (cfg.universe as string[]) : []);
  if (!universe.length) return "trend: 유니버스 비어 있음(설정의 universeRef 또는 universe 필요)";
  const excdMap = ref ? EXCD_MAPS[ref] : (cfg.excdMap as Record<string, string> | undefined);
  if (p.market === "us" && excdMap && typeof excdMap === "object") {
    registerUsExcd(excdMap); // NYSE/AMEX 종목 시세 조회용
  }
  const shortMa = Number(cfg.shortMa ?? 20);
  const longMa = Number(cfg.longMa ?? 60);
  const positionSize = Number(cfg.positionSize ?? 0.1);
  const [holdings, cash] = await broker.account();
  const budgetPer = cash * positionSize;
  let remaining = cash;
  let buys = 0, sells = 0, scanned = 0;
  const intents: OrderIntent[] = [];
  let holdingsValue = 0; // 스캔한 보유 종목 평가액 합(top-up 목표비중용 총자산 산정)
  const topUpCands: { sym: string; price: number; hq: number }[] = []; // 보유 & 상승세 유지 종목
  for (const sym of universe) {
    let closes: number[];
    try {
      closes = (await broker.historyLong(sym, longMa + 20)).map(([, c]) => c);
    } catch (e) {
      log(`[${sym}] 일봉 조회 실패 — 스킵: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (closes.length < longMa + 1) continue;
    scanned++;
    const price = closes[0];
    const [hq] = holdings[sym] ?? [0, 0];
    holdingsValue += hq * price;
    let hadSell = false;
    for (const sig of trendDecide({
      symbol: sym, closes, price, holdingQty: hq,
      principal: Math.min(budgetPer, remaining), shortMa, longMa,
    })) {
      if (sig.side === "buy") {
        const notional = sig.qty * price;
        if (notional > remaining) continue;
        remaining -= notional;
        buys++;
      } else { sells++; hadSell = true; }
      intents.push(sig);
    }
    if (hq > 0 && !hadSell) topUpCands.push({ sym, price, hq }); // 보유 유지(청산 신호 없음) → top-up 후보
  }
  // 유휴현금 top-up(현금 드래그 제거) — 보유·상승세 종목을 목표비중(positionSize×총자산)까지 추가 투입.
  if (cfg.reinvestIdleCash !== false) {
    const equity = cash + holdingsValue;
    const targetPer = positionSize * equity;
    for (const h of topUpCands) {
      if (remaining < h.price) continue;
      const bq = await broker.buyableQty(h.sym, h.price);
      const q = topUpQty({ targetNotional: targetPer, currentNotional: h.hq * h.price, price: h.price,
                           buyableQty: Math.min(bq, Math.floor(remaining / h.price)) });
      if (q >= 1) {
        intents.push({ side: "buy", symbol: h.sym, qty: q, price: h.price, reason: `유휴현금 추가 투입(목표비중 ${Math.round(positionSize * 100)}%)` });
        remaining -= q * h.price;
        buys++;
        log(`[trend ${h.sym}] 유휴현금 추가 투입 — ${q}주(목표비중까지)`);
      }
    }
  }
  await execute(account, p, runId, intents, broker, log);
  const line = `trend: ${scanned}/${universe.length} 스캔 · 매수 ${buys} · 매도 ${sells}`;
  log(line);
  return line;
}

/** 포트폴리오 블록 1개의 사이클 실행 — 요약 문자열 반환(실패는 throw).
 *  phase 는 infinite_v4 전용(미장 both / 국장 sell·buy — LOC 에뮬), 그 외 무시. */
export async function runPortfolioCycle(
  account: AccountDoc, portfolio: PortfolioDoc, runId: Types.ObjectId, log: CycleLogger,
  phase: "main" | "both" | "sell" | "buy" | "close" = "main",
): Promise<string> {
  if (phase === "close") {
    const { runCloseSync } = await import("./close-sync");
    return runCloseSync(account as never, portfolio as never, runId, log);
  }
  if (portfolio.strategy === "infinite_v4") {
    const { runInfiniteV4, makeV4KisBroker, makeV4TossBroker } = await import("./infinite-v4-engine");
    const market = portfolio.market as "kr" | "us";
    const v4Broker = account.broker === "toss"
      ? makeV4TossBroker(makeTossClient(account), market, account._id)
      : makeV4KisBroker(makeKisClient(account), market);
    const v4Phase = phase === "main" ? "both" : phase;
    return runInfiniteV4(account, portfolio, runId, v4Broker, v4Phase, log);
  }
  if (portfolio.strategy === "value_rebalancing") {
    // VR 도 v4 의 V4Broker 어댑터를 재사용(snapshot·executions·place — KIS·토스 자동)
    const { makeV4KisBroker, makeV4TossBroker } = await import("./infinite-v4-engine");
    const { runValueRebalancing } = await import("./value-rebalancing-engine");
    const market = portfolio.market as "kr" | "us";
    const vrBroker = account.broker === "toss"
      ? makeV4TossBroker(makeTossClient(account), market, account._id)
      : makeV4KisBroker(makeKisClient(account), market);
    return runValueRebalancing(account, portfolio, runId, vrBroker, log);
  }
  const broker = makeBroker(account, portfolio.market as "kr" | "us");
  switch (portfolio.strategy) {
    case "lrs_v1":
      return runLrs(account, portfolio, runId, broker, log);
    case "rotation_v1":
      return runRotation(account, portfolio, runId, broker, log);
    case "trend_v1":
      return runTrend(account, portfolio, runId, broker, log);
    default:
      throw new Error(`미지원 전략: ${portfolio.strategy}`);
  }
}

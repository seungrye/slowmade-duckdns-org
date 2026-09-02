// 장 마감 후 사이클(close sync) — 파이썬 데몬의 16:10 마감 sync 를 site 로 이식.
//
// ① 가격: (syncUniverse ∪ 보유) 일봉 최근 30일 → stockdailyprices upsert(차트 라인).
// ② 매매기록: **KIS 체결내역 기반**(파이썬 fills_to_trades_and_pnl 포팅) — 주문이 아닌
//    실제 체결만 남는다(미체결 지정가/LOC 제외, 부분체결 합산·평균단가 실현손익).
//    조회 심볼 = 포트폴리오 대상 ∪ 보유(전 종목 조회는 유량상 불가 — 파이썬 positions 방식).
// ③ 포트폴리오 스냅샷: totalValue = cash + Σ보유×현재가 → portfoliohistories upsert.
// ④ 메일: 하루 1통 — 보유 평가·오늘 체결·실현손익 요약 + 진행 로그 첨부.
// 컬렉션은 ingest API 와 동일하게 collection 레벨 upsert(파이썬 push 와 같은 키 공간).

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

// 마감마다 다시 밀어 넣는 최근 체결 수. 조회한 90일치를 다 덮도록 넉넉히 — API 를 더 부르지
// 않으므로 공짜고, 블록 귀속(#372) 교정이 그 창 안의 옛 기록에도 스스로 따라붙는다.
const RECENT_TRADES = 500;
// 체결내역 조회 범위. **차트가 보는 기간과는 무관하다** — 매매·일봉·스냅샷은 전부 우리 DB 에
// 쌓여 있고, 이 조회는 마지막 sync 이후의 새 체결을 줍는 용도다. 늘려 봐야 이미 가진 것을
// 매일 다시 받아올 뿐이고, 국내 inquire-daily-ccld 는 조회기간 3개월 제한도 있다.
const LOOKBACK_DAYS = 90;
// 현재가 조회 실패 비중이 이 값을 넘으면 스냅샷을 기록하지 않는다(휴장일·대규모 장애 시
// 부분 평가가 총자산으로 영속되는 것을 방지). 그 이하의 소수 실패는 평단가 대체로 흡수.
const MAX_FAIL_RATIO = 0.3;

/** 보유 평가(순수) — 현재가 실패 종목은 평단가(취득원가)로 대체해 평가에서 누락되지
 *  않게 한다. 유효 현재가 = null 아님 · 유한 · 양수. **0/NaN 도 실패로 처리**(유량제한 시
 *  usPrice 가 0/빈값을 반환해도 0원 평가로 총자산이 무너지지 않게 — 07-14 붕괴 원인). */
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
    const price = ok ? live : avg; // 폴백 = 취득원가
    if (!ok) failed.push(sym);
    hv += qty * price;
    rows.push([sym, qty, avg, price]);
  }
  return { hv, failed, failRatio: entries.length ? failed.length / entries.length : 0, rows };
}

// ── 파이썬 site_sync._parse_fill / fills_to_trades_and_pnl 포팅 ──

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
  if (!(qty > 0)) return null; // 체결분만
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
     * 종목 → 그 체결을 낸 블록 (#372). 예전엔 여기에 `strategy: portfolio.strategy` 가
     * 들어와 **계좌 전체 체결을 자기 전략으로 통째 태깅**했다 — 블록이 둘이 되자
     * 먼저 도는 쪽이 선점했다. 이제 주인이 분명한 체결만 태그를 받는다.
     */
    owner: (ticker: string, date: string) => FillOwner | null;
  },
): { records: Json[]; run: number; cum: number } {
  const defaultCur = opts.market === "kr" ? "KRW" : "USD";
  // 같은 (종목·시각·구분) 부분체결 합산(가중평균)
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
    // 주인이 없으면(옛 유니버스 청산분·겹치는 종목) 태그 없이 기록만 남긴다.
    // buildTradeUpsertOp 이 undefined 를 걸러 빈 값을 박지 않는다.
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

// ── upsert 헬퍼(ingest API 와 동일 키) ──────────────────────────

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
  // strategy 만은 $setOnInsert 로 간다 — 재푸시가 과거 기록의 전략 태그를 덮지 않도록 (#77).
  // 조립 규칙은 trade-upsert.ts(순수 함수, 테스트 있음)에 있다.
  const ops = records.map(buildTradeUpsertOp);
  const res = await StockTrade.collection.bulkWrite(ops as never[], { ordered: false });
  return (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0);
}

// ── 마감 사이클 본체 ─────────────────────────────────────────────

type AccountDoc = {
  _id: Types.ObjectId; broker: string; envKey: string;
  credentials: unknown; env: string; liveEnabled?: boolean | null;
};
type PortfolioDoc = {
  _id: Types.ObjectId; market: string; strategy: string; config: unknown;
  /** 블록 스냅샷이 자기 현금 장부를 읽는다 (#367). 스케줄러가 select 없이 lean() 으로 읽어 온다. */
  state?: unknown;
  /** 체결 귀속의 하한선 (#372). 이 날 전의 체결은 이 블록 것이 아니다. */
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

  // 잔고(보유·현금·증권사 평가금액)
  let holdings: Record<string, [number, number]> = {};
  let cash = 0;
  let hvBroker = 0; // 증권사 API 가 준 보유 평가금액(우리가 현재가를 재계산하지 않는다)
  let balOk = true;
  try {
    [holdings, cash, hvBroker] = isToss
      ? await toss!.account(market)
      : market === "kr" ? await kis!.krAccount() : await kis!.usAccount();
  } catch (e) {
    balOk = false;
    log(`잔고 조회 실패 → 포트폴리오 스냅샷 생략: ${e instanceof Error ? e.message : e}`);
  }

  // ① 가격 push — syncUniverseRef(명명 유니버스) ∪ syncUniverse(인라인, 하위호환) ∪
  //   config.universe ∪ 보유. 대형 종목 목록은 포트폴리오 문서 대신 universes.ts 로 분리.
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
  // NYSE/AMEX 종목 일봉은 정확한 EXCD 로 조회해야 한다. registerUsExcd 는 trend 엔진
  // 매매 사이클에서만 호출되는데, close-sync(마감 사이클)는 별도 실행이라 모듈 레지스트리가
  // 비어 있다 → 미등록 NYSE 종목이 전부 기본 NAS 로 조회돼 0건(07-14 NYSE 가격 유실 원인).
  // 여기서도 포트폴리오 excd 매핑(universeRef 또는 인라인)을 등록한다.
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

  // ② 매매기록 + 실현손익 — 체결내역 기반(대상 ∪ 보유 심볼)
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
    // 토스: 종료 상태 체결조회 API 가 없어, 우리가 기록한 실주문(orderNo)의 상세(orderDetail)
    // 로 체결을 취합한다(V4TossBroker 와 같은 방식). ticker 는 주문 로그의 symbol 로 매핑.
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
        if (qty < 1) continue; // 체결분만
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
        continue; // 주문 단위 격리 — 하나의 조회 실패가 대사 전체를 막지 않게
      }
    }
  } else if (market === "us") {
    // 미장: 거래소별 일괄조회(전 종목). 종목별 NASD 조회는 NYSE 상장 보유의 체결을
    // 놓쳐 실현손익이 0 이 되던 원인 → 전 거래소 일괄로 교체.
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
  // 체결 귀속(#372) — 같은 계정·시장의 **형제 블록**을 함께 봐야 "이 종목의 주인이 나뿐인가"
  // 를 판단할 수 있다. 블록 하나가 자기 종목만 보면 겹침을 못 알아챈다.
  let siblings: AttributionBlock[] = [];
  try {
    const docs = await TradingPortfolio.find({
      accountId: account._id, market, isDeleted: { $ne: true },
    }).select({ strategy: 1, config: 1, createdAt: 1 }).lean();
    siblings = docs.map((d) => ({
      id: String(d._id), strategy: String(d.strategy ?? ""),
      config: (d.config ?? {}) as Record<string, unknown>,
      // 블록이 생기기 전 체결은 그 블록 것이 아니다 — 90일 재훑기가 옛 전략 매매를 끌어간다.
      ...(d.createdAt ? { since: new Date(d.createdAt as Date).toISOString().slice(0, 10) } : {}),
    }));
  } catch (e) {
    // 조회 실패 시 자기 블록만으로 판단한다 — 태그가 덜 붙을 뿐 틀리게 붙지는 않는다.
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
  run = out.run;   // 폴백값(체결내역 avg-cost 자체계산)
  cum = out.cum;
  tradeCount = await upsertTrades(out.records);
  // 실현손익은 **증권사 기간손익 API 우선**(KIS 실계좌) — 실패(모의 미지원)면 위 자체계산 유지.
  // 토스는 기간손익 API 가 없어 체결내역 자체계산(run/cum)을 그대로 쓴다.
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

  // ③ 포트폴리오 스냅샷 — 보유 평가는 **증권사 API 가 준 평가금액**(hvBroker)을 그대로
  // 사용한다(우리가 종목별 현재가를 재조회해 곱하지 않는다 → 유량제한에 총자산이
  // 무너지지 않음). hvBroker 가 없을 때만(토스 등) 폴백으로 자체 계산(원가 대체 포함).
  let evalRows: [string, number, number, number][] = []; // sym, qty, avg, price (메일 표시용)
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
      // 증권사 평가금액 사용 — 메일 표시는 원가 기준(별도 가격조회 없음)
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

      // 블록 행 (#367) — 계좌 행만으로는 한 계정·한 시장의 블록 둘을 구분할 수 없다.
      // 그 블록이 아는 것만 적는다(장부가 없는 전략은 cash 를 비운다).
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

  // ④ 마감 메일(하루 1통) — 파이썬 마감 사이클 메일 대응
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

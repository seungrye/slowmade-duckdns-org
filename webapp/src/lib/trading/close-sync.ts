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
import type { Types } from "mongoose";
import { KisClient, usQuoteExcd, registerUsExcd } from "./kis-client";
import { makeKisClient, makeTossClient, marketToday } from "./engines";
import type { CycleLogger } from "./engines";
import { TossClient } from "./toss-client";
import { sendTradingMail } from "./mailer";
import { UNIVERSES, EXCD_MAPS } from "./universes";
import { normalizeTradeTime } from "@/lib/trade-time";

type Json = Record<string, unknown>;
type Fill = {
  ticker: string; date: string; time: string; side: "buy" | "sell";
  qty: number; price: number; currency: string;
};

const RECENT_TRADES = 100;
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
  fills: Fill[], opts: { env: string; strategy: string; market: "kr" | "us"; today: string },
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
  const records = recent.map(({ r, cumQty, price }) => ({
    env: opts.env, ticker: r.ticker, action: r.side, strategy: opts.strategy,
    qty: r.qty, cumulativeQty: cumQty,
    price: Math.round(price * 10000) / 10000,
    amount: Math.round(r.amount * 10000) / 10000,
    currency: r.currency || defaultCur,
    date: r.date, time: r.time,
  }));
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
  const ops = records.map((r) => {
    const time = normalizeTradeTime(String(r.time));
    return {
      updateOne: {
        filter: { env: r.env, ticker: r.ticker, time },
        update: { $set: { ...r, time } },
        upsert: true,
      },
    };
  });
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
  if (!isToss) {
    const fills: Fill[] = [];
    if (market === "us") {
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
    const out = fillsToTradesAndPnl(fills, {
      env: account.envKey, strategy: portfolio.strategy, market, today,
    });
    run = out.run;   // 폴백값(체결내역 avg-cost 자체계산)
    cum = out.cum;
    tradeCount = await upsertTrades(out.records);
    // 실현손익은 **증권사 기간손익 API 우선**(실계좌) — 실패(모의 미지원)면 위 자체계산 유지.
    // (매매기록/차트 마커는 체결내역이 단일 소스, pnl 총액만 증권사 값으로 대체.)
    try {
      const base = new Date(now.getTime() - 1825 * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
      cum = market === "kr" ? await kis!.krRealizedPnl(base, todayKey) : await kis!.usRealizedPnl(base, todayKey);
      run = market === "kr" ? await kis!.krRealizedPnl(todayKey, todayKey) : await kis!.usRealizedPnl(todayKey, todayKey);
      log(`실현손익: 증권사 기간손익 API 사용 (오늘 ${run.toFixed(0)} · 누적 ${cum.toFixed(0)})`);
    } catch (e) {
      log(`실현손익: 기간손익 API 미지원(모의 등) → 체결내역 자체계산 유지 (누적 ${cum.toFixed(0)}): `
        + `${e instanceof Error ? e.message : e}`);
    }
  } else {
    log("토스: 종료 주문 목록 미지원 — 매매기록은 주문 로그 기반(v4 대사 경로) 유지");
  }
  log(`매매기록: ${tradeCount}건 upsert · 오늘 실현 ${run.toFixed(0)} · 누적 ${cum.toFixed(0)}`);

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
      log(`포트폴리오 스냅샷: 현금 ${cash.toFixed(0)} + 보유 ${hv.toFixed(0)}`);
    }
  }

  // ④ 마감 메일(하루 1통) — 파이썬 마감 사이클 메일 대응
  const body = [
    `실행: ${now.toISOString()} · ${account.envKey} · ${market.toUpperCase()}/${portfolio.strategy}`,
    "",
    `오늘 실현손익: ${run.toFixed(2)} ${currency} · 누적: ${cum.toFixed(2)} ${currency}`,
    balOk ? `현금: ${cash.toFixed(2)} ${currency}` : "잔고 조회 실패(스냅샷 생략)",
    "",
    "보유:",
    ...(evalRows.length
      ? evalRows.map(([s, q, a, p]) =>
          `  ${s}: ${q}주 · 평단 ${a.toFixed(2)} · 현재 ${p.toFixed(2)} (${(((p - a) / a) * 100 || 0).toFixed(1)}%)`)
      : ["  (없음)"]),
  ].join("\n");
  const mailed = await sendTradingMail(
    `체결 결과 ${today} — ${market.toUpperCase()}/${portfolio.strategy}`, body);
  log(mailed ? "마감 메일 발송 완료" : "메일 미설정/실패 — 스킵");

  return `close-sync: 가격 ${priceSyms}종목 · 매매 ${tradeCount}건 · 실현 ${run.toFixed(0)}/${cum.toFixed(0)}`;
}

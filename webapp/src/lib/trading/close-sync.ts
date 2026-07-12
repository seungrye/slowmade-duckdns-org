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
import { KisClient, usQuoteExcd } from "./kis-client";
import { makeKisClient, makeTossClient, marketToday } from "./engines";
import type { CycleLogger } from "./engines";
import { TossClient } from "./toss-client";
import { sendTradingMail } from "./mailer";

type Json = Record<string, unknown>;
type Fill = {
  ticker: string; date: string; time: string; side: "buy" | "sell";
  qty: number; price: number; currency: string;
};

const RECENT_TRADES = 100;
const LOOKBACK_DAYS = 90;

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
  const ops = records.map((r) => ({
    updateOne: {
      filter: { env: r.env, ticker: r.ticker, time: r.time },
      update: { $set: r },
      upsert: true,
    },
  }));
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

  // 잔고(보유·현금)
  let holdings: Record<string, [number, number]> = {};
  let cash = 0;
  let balOk = true;
  try {
    [holdings, cash] = isToss
      ? await toss!.account(market)
      : market === "kr" ? await kis!.krAccount() : await kis!.usAccount();
  } catch (e) {
    balOk = false;
    log(`잔고 조회 실패 → 포트폴리오 스냅샷 생략: ${e instanceof Error ? e.message : e}`);
  }

  // ① 가격 push — syncUniverse ∪ config.universe ∪ 보유
  const uni = new Set<string>([
    ...(Array.isArray(cfg.syncUniverse) ? (cfg.syncUniverse as string[]) : []),
    ...(Array.isArray(cfg.universe) ? (cfg.universe as string[]) : []),
    ...(cfg.symbol ? [String(cfg.symbol)] : []),
    ...Object.keys(holdings),
  ]);
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
    for (const sym of tradeSyms) {
      try {
        const rows = market === "kr"
          ? await kis!.krExecutions(sym, start, todayKey)
          : await kis!.usExecutions(sym, start, todayKey);
        for (const r of rows) {
          const p = parseFill(r as Json);
          if (p) fills.push(p);
        }
      } catch (e) {
        log(`[${sym}] 체결내역 조회 실패 — 스킵: ${e instanceof Error ? e.message : e}`);
      }
    }
    const out = fillsToTradesAndPnl(fills, {
      env: account.envKey, strategy: portfolio.strategy, market, today,
    });
    run = out.run;
    cum = out.cum;
    tradeCount = await upsertTrades(out.records);
  } else {
    log("토스: 종료 주문 목록 미지원 — 매매기록은 주문 로그 기반(v4 대사 경로) 유지");
  }
  log(`매매기록: ${tradeCount}건 upsert · 오늘 실현 ${run.toFixed(0)} · 누적 ${cum.toFixed(0)}`);

  // ③ 포트폴리오 스냅샷
  const evalRows: [string, number, number, number][] = []; // sym, qty, avg, price
  if (balOk) {
    let hv = 0;
    for (const [sym, [qty, avg]] of Object.entries(holdings)) {
      try {
        const price = isToss
          ? await toss!.price(sym)
          : market === "kr" ? await kis!.krPrice(sym) : await kis!.usPrice(sym, usQuoteExcd(sym));
        hv += qty * price;
        evalRows.push([sym, qty, avg, price]);
      } catch (e) {
        log(`[${sym}] 현재가 실패(평가 제외): ${e instanceof Error ? e.message : e}`);
      }
    }
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

// 자동매매 스케줄러 — 파이썬 데몬 Scheduler 의 site 대응.
//
// 동작: instrumentation(서버 기동)에서 start → 60초 틱. 틱마다 활성 포트폴리오의
// "실행 시각 경과 & 오늘 미실행"을 찾아 **Mongo 원자 클레임**(TradingRun unique
// (portfolioId, dateKey) + insert) 후 실행한다. 그래서:
//   - 기동 catch-up: run 시각이 지났는데 오늘 기록이 없으면 첫 틱에서 실행(배포 재시작 내성).
//   - 블루그린 공존: 구/신 인스턴스가 같은 틱을 돌아도 클레임은 한쪽만 성공(E11000).
//   - 멱등: 완료(done)·실패(failed) 기록이 있으면 재실행하지 않는다(수동은 run-now).
//   - 크래시 잔재: running 이 STALE_MS 넘으면 failed 처리(다음 날 정상 재개).
// 시각: kr=Asia/Seoul, us=America/New_York(서머타임 자동 — 파이썬 zoneinfo 와 동일 의미).

import { connectToDB } from "@/lib/db";
import TradingAccount from "@/models/trading-account";
import TradingPortfolio from "@/models/trading-portfolio";
import TradingRun from "@/models/trading-run";
import { runPortfolioCycle } from "./engines";

const TICK_MS = 60_000;
const STALE_MS = 45 * 60_000;

// ── 순수 헬퍼(테스트 대상) ───────────────────────────────────────

export type MarketClock = { dateKey: string; hhmm: string; isWeekday: boolean };

/** 시장 tz 의 현재 날짜키(YYYY-MM-DD)·시각(HH:MM)·평일 여부. */
export function marketClock(market: "kr" | "us", now = new Date()): MarketClock {
  const tz = market === "kr" ? "Asia/Seoul" : "America/New_York";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${hour}:${get("minute")}`,
    isWeekday: !["Sat", "Sun"].includes(get("weekday")),
  };
}

export type Cycle = { phase: "main" | "both" | "sell" | "buy"; at: string };

/** 포트폴리오의 하루 사이클 목록 — 국장 infinite_v4 만 2사이클(매도 09:30류 + 매수 15:20). */
export function cyclesFor(p: { strategy: string; market: string; runAt: string }): Cycle[] {
  if (p.strategy === "infinite_v4" && p.market === "kr") {
    return [{ phase: "sell", at: p.runAt }, { phase: "buy", at: "15:20" }];
  }
  if (p.strategy === "infinite_v4") return [{ phase: "both", at: p.runAt }];
  return [{ phase: "main", at: p.runAt }];
}

/** 실행해야 하는 시점인가 — 시각 경과(당일) && (주중 조건). 기록 유무는 클레임이 판단. */
export function isDue(
  p: { runAt: string; weekdaysOnly?: boolean | null; enabled?: boolean | null },
  clock: MarketClock,
): boolean {
  if (p.enabled === false) return false;
  if ((p.weekdaysOnly ?? true) && !clock.isWeekday) return false;
  return clock.hhmm >= p.runAt;
}

// ── 클레임(멱등의 핵심) ──────────────────────────────────────────

type ClaimResult = { runId: string } | null;

async function claimRun(
  portfolioId: string, accountId: string, dateKey: string, phase: string,
  dryRun: boolean, catchUp: boolean,
): Promise<ClaimResult> {
  try {
    const doc = await TradingRun.create({
      portfolioId, accountId, dateKey, phase, status: "running", dryRun, catchUp,
      startedAt: new Date(),
    });
    return { runId: String(doc._id) };
  } catch (e: unknown) {
    const code = (e as { code?: number }).code;
    if (code !== 11000) throw e; // unique 충돌 외 오류는 전파
    // 이미 누군가 클레임 — 크래시 잔재(running & stale)면 failed 처리(오늘은 재실행 안 함).
    const existing = await TradingRun.findOne({ portfolioId, dateKey, phase });
    if (existing && existing.status === "running" &&
        Date.now() - existing.startedAt.getTime() > STALE_MS) {
      await TradingRun.updateOne(
        { _id: existing._id, status: "running" },
        { $set: { status: "failed", error: "stale running(크래시 추정) — 자동 정리", finishedAt: new Date() } },
      );
    }
    return null;
  }
}

// ── 틱 ──────────────────────────────────────────────────────────

export async function tradingTick(now = new Date()): Promise<void> {
  await connectToDB();
  const portfolios = await TradingPortfolio.find({ enabled: true }).lean();
  if (!portfolios.length) return;
  const accounts = new Map(
    (await TradingAccount.find({}).lean()).map((a) => [String(a._id), a]),
  );
  for (const p of portfolios) {
    const account = accounts.get(String(p.accountId));
    if (!account) continue;
    const clock = marketClock(p.market as "kr" | "us", now);
    for (const cycle of cyclesFor({ strategy: p.strategy, market: p.market, runAt: p.runAt })) {
      if (!isDue({ runAt: cycle.at, weekdaysOnly: p.weekdaysOnly, enabled: p.enabled }, clock)) continue;

      const live = Boolean(account.liveEnabled) && process.env.TRADING_LIVE_ALLOWED === "true";
      const catchUp = clock.hhmm > cycle.at; // 정시 틱(≤1분 지연)이 아니면 catch-up 성격
      const claim = await claimRun(
        String(p._id), String(p.accountId), clock.dateKey, cycle.phase, !live, catchUp,
      );
      if (!claim) continue;

      const logs: string[] = [];
      const log = (line: string) => {
        logs.push(`${new Date().toISOString()} ${line}`);
        console.log(`[trading:${account.envKey}/${p.strategy}:${cycle.phase}] ${line}`);
      };
      try {
        log(`사이클 시작 (${p.market} ${p.strategy}/${cycle.phase} · ${live ? "LIVE" : "dry-run"}${catchUp ? " · catch-up" : ""})`);
        const summary = await runPortfolioCycle(
          account as never, p as never, claim.runId as never, log, cycle.phase,
        );
        await TradingRun.updateOne(
          { _id: claim.runId },
          { $set: { status: "done", summary, logs, finishedAt: new Date() } },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`사이클 실패: ${msg}`);
        await TradingRun.updateOne(
          { _id: claim.runId },
          { $set: { status: "failed", error: msg, logs, finishedAt: new Date() } },
        );
      }
    }
  }
}

// ── 기동(instrumentation 에서 호출) ──────────────────────────────

declare global {
  var __tradingSchedulerStarted: boolean | undefined;
}

export function startTradingScheduler(): void {
  if (process.env.TRADING_SCHEDULER_ENABLED === "false") return;
  if (globalThis.__tradingSchedulerStarted) return; // dev HMR·중복 register 가드
  globalThis.__tradingSchedulerStarted = true;
  const safeTick = () =>
    tradingTick().catch((e) => console.error("[trading] tick 실패:", e));
  // 첫 틱 = 기동 catch-up. DB/설정 미비 등 어떤 실패도 서버를 죽이지 않는다.
  setTimeout(safeTick, 10_000); // 서버 워밍업 직후
  setInterval(safeTick, TICK_MS);
  console.log("[trading] 스케줄러 시작 — 60초 틱, catch-up 포함");
}

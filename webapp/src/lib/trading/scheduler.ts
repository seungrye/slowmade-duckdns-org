// The trading scheduler - the site's answer to the Python daemon's Scheduler.
//
// How it works: instrumentation (server start) calls start, then a 60-second tick. Each tick finds active
// portfolios whose "run time has passed and has not run today" and runs them after an **atomic Mongo claim**
// (a TradingRun unique (portfolioId, dateKey) plus an insert). So:
//   - Startup catch-up: a run time that has passed with no record today runs on the first tick (surviving a deploy restart).
//   - Blue/green coexistence: even if the old and new instances tick together, only one claim succeeds (E11000).
//   - Idempotent: a done or failed record means no re-run (manual runs use run-now).
//   - Crash leftovers: a running record older than STALE_MS is marked failed (and resumes normally the next day).
// Times: kr = Asia/Seoul, us = America/New_York (DST automatic - the same meaning as Python's zoneinfo).

import { connectToDB } from "@/lib/db";
import TradingAccount from "@/models/trading-account";
import TradingPortfolio from "@/models/trading-portfolio";
import TradingRun from "@/models/trading-run";
import { runPortfolioCycle } from "./engines";

const TICK_MS = 60_000;
const STALE_MS = 45 * 60_000;

// ── Pure helpers (what the tests cover) ───────────────────────────

export type MarketClock = { dateKey: string; hhmm: string; isWeekday: boolean };

/** The current date key (YYYY-MM-DD), time (HH:MM) and weekday flag in the market's tz. */
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

export type Cycle = { phase: "main" | "both" | "sell" | "buy" | "close"; at: string };

/** A portfolio's cycles for the day - the trading cycle(s) plus the close sync (16:10, market tz).
 *  KRX infinite_v4 has two trading cycles (a 09:30-style sell plus a 15:20 buy). */
export function cyclesFor(p: { strategy: string; market: string; runAt: string }): Cycle[] {
  const close: Cycle = { phase: "close", at: "16:10" }; // fill confirmation, chart sync and mail (matching Python's close cycle)
  if (p.strategy === "infinite_v4" && p.market === "kr") {
    return [{ phase: "sell", at: p.runAt }, { phase: "buy", at: "15:20" }, close];
  }
  if (p.strategy === "infinite_v4") return [{ phase: "both", at: p.runAt }, close];
  return [{ phase: "main", at: p.runAt }, close];
}

/** Whether it is time to run - the time has passed today and the weekday condition holds. Whether a record exists is the claim's job. */
export function isDue(
  p: { runAt: string; weekdaysOnly?: boolean | null; enabled?: boolean | null },
  clock: MarketClock,
): boolean {
  if (p.enabled === false) return false;
  if ((p.weekdaysOnly ?? true) && !clock.isWeekday) return false;
  return clock.hhmm >= p.runAt;
}

// ── The claim (the heart of idempotency) ──────────────────────────

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
    if (code !== 11000) throw e; // anything but a unique-key collision propagates
    // Someone already claimed it - a crash leftover (running and stale) is marked failed (with no re-run today).
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

// ── The tick ──────────────────────────────────────────────────────

export async function tradingTick(now = new Date()): Promise<void> {
  await connectToDB();
  const portfolios = await TradingPortfolio.find({ enabled: true, isDeleted: { $ne: true } }).lean();
  if (!portfolios.length) return;
  const accounts = new Map(
    (await TradingAccount.find({ isDeleted: { $ne: true } }).lean()).map((a) => [String(a._id), a]),
  );
  for (const p of portfolios) {
    const account = accounts.get(String(p.accountId));
    if (!account) continue;
    const clock = marketClock(p.market as "kr" | "us", now);
    for (const cycle of cyclesFor({ strategy: p.strategy, market: p.market, runAt: p.runAt })) {
      if (!isDue({ runAt: cycle.at, weekdaysOnly: p.weekdaysOnly, enabled: p.enabled }, clock)) continue;

      const live = Boolean(account.liveEnabled) && process.env.TRADING_LIVE_ALLOWED === "true";
      const catchUp = clock.hhmm > cycle.at; // Anything but an on-time tick (within a minute) counts as catch-up
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
        // A failure mails immediately (matching Python's trading-cycle failure notice). Failures are swallowed.
        const { sendTradingMail } = await import("./mailer");
        await sendTradingMail(
          `⚠ 사이클 실패 ${clock.dateKey} — ${account.envKey} ${p.market}/${p.strategy}/${cycle.phase}`,
          `${msg}\n\n로그:\n${logs.slice(-20).join("\n")}`,
        );
      }
    }
  }
}

// ── Startup (called from instrumentation) ──────────────────────────

declare global {
  var __tradingSchedulerStarted: boolean | undefined;
  var __tradingTickRunning: boolean | undefined;
}

export function startTradingScheduler(): void {
  if (process.env.TRADING_SCHEDULER_ENABLED === "false") return;
  if (globalThis.__tradingSchedulerStarted) return; // guards against dev HMR and duplicate registration
  globalThis.__tradingSchedulerStarted = true;
  // Re-entry guard - a long cycle (a US universe scan takes minutes) overlapping the 60-second tick would run
  // twice at once and flood the KIS quota. While one is running, this tick is skipped (in-process serialisation,
  // separate from the claim - a missed cycle is picked up by the next tick's catch-up).
  const safeTick = async () => {
    if (globalThis.__tradingTickRunning) return;
    globalThis.__tradingTickRunning = true;
    try {
      await tradingTick();
    } catch (e) {
      console.error("[trading] tick 실패:", e);
    } finally {
      globalThis.__tradingTickRunning = false;
    }
  };
  // The first tick is the startup catch-up. No failure (a missing DB or config) may kill the server.
  setTimeout(safeTick, 10_000); // just after the server warms up
  setInterval(safeTick, TICK_MS);
  console.log("[trading] 스케줄러 시작 — 60초 틱, catch-up 포함");
}

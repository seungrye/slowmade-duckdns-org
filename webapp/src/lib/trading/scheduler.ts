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
import TradingOrderLog from "@/models/trading-order-log";
import { runPortfolioCycle } from "./engines";

const TICK_MS = 60_000;
const STALE_MS = 45 * 60_000;
// 실패한 사이클을 그날 다시 잡아 볼 최대 횟수 (#487). 설정 오류처럼 고쳐지지 않는
// 실패로 하루 종일 돌지 않게 막는 상한이다.
const MAX_RETRIES = 2;

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

export type Cycle = { phase: "main" | "both" | "sell" | "buy" | "close"; at: string };

/** 포트폴리오의 하루 사이클 목록 — 매매 사이클(들) + 마감 sync(16:10, 시장 tz).
 *  국장 infinite_v4 는 매매가 2사이클(매도 09:30류 + 매수 15:20). */
export function cyclesFor(p: { strategy: string; market: string; runAt: string }): Cycle[] {
  const close: Cycle = { phase: "close", at: "16:10" }; // 체결확인·차트 sync·메일(파이썬 마감 대응)
  if (p.strategy === "infinite_v4" && p.market === "kr") {
    return [{ phase: "sell", at: p.runAt }, { phase: "buy", at: "15:20" }, close];
  }
  if (p.strategy === "infinite_v4") return [{ phase: "both", at: p.runAt }, close];
  return [{ phase: "main", at: p.runAt }, close];
}

/** run-now 가 기본으로 돌려 볼 phase — 그 포트폴리오의 **다음 매매 사이클** (#488).
 *  마감(close)은 매매가 아니라 고르지 않는다. 예전엔 무조건 "main" 이라 v4 에서 "both" 로
 *  매핑됐는데, 국장 v4 는 both 로 안 돈다(sell/buy 2단계) — 돌지도 않을 계획을 보여줬다. */
export function firstTradingPhase(
  p: { strategy: string; market: string; runAt: string },
): Cycle["phase"] {
  return cyclesFor(p).find((c) => c.phase !== "close")?.phase ?? "main";
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

/**
 * 실패한 사이클을 그날 다시 잡아도 되는가 — **순수**(DB 를 모른다) (#487).
 *
 * 그냥 재시도하면 안 된다. 사이클은 **주문이 나간 뒤에도** 실패할 수 있고(배포가 프로세스를
 * 죽이면 running 이 stale 을 넘겨 failed 가 된다), `engines.ts` 의 `execute()` 는 취소 단계가
 * 없어 재실행하면 중복 주문이 난다.
 *
 * 그래서 **그 런에서 실주문이 한 건도 안 나갔을 때만** 잡는다. 유실보다 중복이 위험하다.
 */
export function canRetryRun(
  run: { status: string; attempts?: number | null },
  liveOrdersSent: number,
  maxRetries = MAX_RETRIES,
): boolean {
  return mayRetryRun(run, maxRetries) && liveOrdersSent === 0;
}

/** 주문 원장을 보기 **전에** 싸게 거른다 — 성공했거나 아직 돌거나 상한에 닿았으면 셀 필요도 없다.
 *  `isDue` 가 하루 종일 참이라 클레임 충돌은 매 틱 일어난다. 그때마다 countDocuments 를
 *  때리면 하루 수천 번이 된다(대부분 이미 done 인 런). */
export function mayRetryRun(
  run: { status: string; attempts?: number | null },
  maxRetries = MAX_RETRIES,
): boolean {
  return run.status === "failed" && (run.attempts ?? 0) < maxRetries;
}

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
    // 이미 누군가 클레임 — 크래시 잔재(running & stale)면 failed 로 내린다.
    const existing = await TradingRun.findOne({ portfolioId, dateKey, phase });
    if (!existing) return null;
    if (existing.status === "running" &&
        Date.now() - existing.startedAt.getTime() > STALE_MS) {
      await TradingRun.updateOne(
        { _id: existing._id, status: "running" },
        { $set: { status: "failed", error: "stale running(크래시 추정) — 자동 정리", finishedAt: new Date() } },
      );
      existing.status = "failed"; // 아래 재시도 판단에 반영(같은 틱에 바로 잡을 수 있게)
    }
    // 일시 오류(KIS 5xx·빈 응답·배포 중 종료)로 실패한 사이클은 그날 다시 잡는다 (#487).
    // 주문이 이미 나갔으면 잡지 않는다 — 판단 근거는 KIS 가 아니라 우리 주문 원장이다.
    if (!mayRetryRun(existing)) return null; // 원장 조회 전 싼 가드
    const sent = await TradingOrderLog.countDocuments({ runId: existing._id, dryRun: false });
    if (!canRetryRun(existing, sent)) return null;
    // 원자 재클레임 — blue/green 두 인스턴스가 같은 틱에 들어와도 한쪽만 성공한다.
    const re = await TradingRun.findOneAndUpdate(
      { _id: existing._id, status: "failed", attempts: { $lt: MAX_RETRIES } },
      { $set: { status: "running", startedAt: new Date(), error: "", finishedAt: null },
        $inc: { attempts: 1 } },
      { new: true },
    );
    return re ? { runId: String(re._id) } : null;
  }
}

// ── 틱 ──────────────────────────────────────────────────────────

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
        // 실패는 즉시 메일(파이썬 매매 사이클 실패 알림 대응). 실패는 삼킨다.
        const { sendTradingMail } = await import("./mailer");
        await sendTradingMail(
          `⚠ 사이클 실패 ${clock.dateKey} — ${account.envKey} ${p.market}/${p.strategy}/${cycle.phase}`,
          `${msg}\n\n로그:\n${logs.slice(-20).join("\n")}`,
        );
      }
    }
  }
}

// ── 기동(instrumentation 에서 호출) ──────────────────────────────

declare global {
  var __tradingSchedulerStarted: boolean | undefined;
  var __tradingTickRunning: boolean | undefined;
}

export function startTradingScheduler(): void {
  if (process.env.TRADING_SCHEDULER_ENABLED === "false") return;
  if (globalThis.__tradingSchedulerStarted) return; // dev HMR·중복 register 가드
  globalThis.__tradingSchedulerStarted = true;
  // 재진입 가드 — 장시간 사이클(미장 유니버스 스캔 ~수 분)이 60초 틱과 겹쳐
  // 동시 실행되면 KIS 유량이 폭주한다. 실행 중이면 이번 틱은 건너뛴다(클레임과 별개의
  // 프로세스 내 직렬화 — 놓친 사이클은 다음 틱의 catch-up 이 줍는다).
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
  // 첫 틱 = 기동 catch-up. DB/설정 미비 등 어떤 실패도 서버를 죽이지 않는다.
  setTimeout(safeTick, 10_000); // 서버 워밍업 직후
  setInterval(safeTick, TICK_MS);
  console.log("[trading] 스케줄러 시작 — 60초 틱, catch-up 포함");
}

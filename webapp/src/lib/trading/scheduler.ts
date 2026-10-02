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
// 매매 사이클을 늦게라도 돌려 줄 창(분) (#507). 이 안에 못 돌면 그날은 건너뛴다 —
// 종가 기준으로 짠 주문이 장 마감 뒤에 나가는 것보다 안 나가는 게 낫다.
const CATCH_UP_WINDOW_MIN = 90;

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
/** "HH:MM" 에 분을 더한다(24시 넘으면 23:59 로 고정 — 그날 안에서만 유효하다). */
export function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + minutes;
  if (t >= 24 * 60) return "23:59";
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function isDue(
  p: { runAt: string; weekdaysOnly?: boolean | null; enabled?: boolean | null; phase?: string },
  clock: MarketClock,
): boolean {
  if (p.enabled === false) return false;
  if ((p.weekdaysOnly ?? true) && !clock.isWeekday) return false;
  if (clock.hhmm < p.runAt) return false;
  // **상한** (#507) — 예전엔 시각이 지나기만 하면 하루 종일 due 였다. 재시작·배포 catch-up 이
  // 장 마감 뒤에 그날 계획을 그대로 주문하면, 종가 기준으로 짠 LOC·지정가가 엉뚱한 시점에
  // 나간다. 마감 sync(close)는 늦게 돌아도 무해하므로 예외로 둔다.
  if (p.phase === "close") return true;
  return clock.hhmm <= addMinutes(p.runAt, CATCH_UP_WINDOW_MIN);
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
  /** **접수된** 실주문 수. 증권사가 거부한 행(orderNo="")은 세지 않는다 (#511). */
  liveOrdersSent: number,
  /** **접수 불명** 주문 수(orderNo=UNKNOWN_ACK) — 타임아웃·네트워크 끊김 (#525).
   *  KIS 가 받았는지 모르므로 "나갔을 수 있는 것" 으로 센다. 중복 주문이 유실보다 위험하다. */
  unknownAck = 0,
  maxRetries = MAX_RETRIES,
): boolean {
  return mayRetryRun(run, maxRetries) && liveOrdersSent === 0 && unknownAck === 0;
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
      const flipped = await TradingRun.updateOne(
        { _id: existing._id, status: "running" },
        { $set: { status: "failed", error: "stale running(크래시 추정) — 자동 정리", finishedAt: new Date() } },
      );
      existing.status = "failed"; // 아래 재시도 판단에 반영(같은 틱에 바로 잡을 수 있게)
      // **알린다** (#523). 이 경로는 in-process catch 를 못 타므로 여기서 안 보내면 아무도
      // 모른다. 전환에 실제로 성공한 쪽만 보낸다(blue/green 두 인스턴스 중복 방지).
      if (flipped.modifiedCount) {
        try {
          const [pf, acct] = await Promise.all([
            TradingPortfolio.findById(portfolioId).select({ market: 1, strategy: 1, config: 1 }).lean(),
            TradingAccount.findById(accountId).select({ envKey: 1 }).lean(),
          ]);
          const n = staleRunNotice(
            {
              envKey: String((acct as { envKey?: string } | null)?.envKey ?? accountId),
              market: String((pf as { market?: string } | null)?.market ?? "?"),
              strategy: String((pf as { strategy?: string } | null)?.strategy ?? "?"),
              symbol: (pf as { config?: { symbol?: string } } | null)?.config?.symbol,
            },
            dateKey, phase, existing.startedAt,
          );
          const { sendTradingMail } = await import("./mailer");
          await sendTradingMail(n.subject, n.body);
        } catch (e) {
          console.warn("[trading] 중단 알림 실패(삼킴):", e instanceof Error ? e.message : e);
        }
      }
    }
    // 일시 오류(KIS 5xx·빈 응답·배포 중 종료)로 실패한 사이클은 그날 다시 잡는다 (#487).
    // 주문이 이미 나갔으면 잡지 않는다 — 판단 근거는 KIS 가 아니라 우리 주문 원장이다.
    if (!mayRetryRun(existing)) return null; // 원장 조회 전 싼 가드
    // **실제로 접수된 것만** 센다 (#511). #507 이 거부도 원장에 남기게 하면서(`orderNo: ""`)
    // 이 가드가 깨졌다 — 첫 주문의 일시 오류 하나로 거부 행이 생기면 "주문이 나갔다" 로
    // 오판해 그날 사이클을 영구 포기했다. 국장 v4 sell 은 주문이 q75 하나뿐이라 특히 치명적이다.
    const [sent, unknown] = await Promise.all([
      TradingOrderLog.countDocuments({
        runId: existing._id, dryRun: false, orderNo: { $nin: ["", null, UNKNOWN_ACK] },
      }),
      // 접수 불명(#525) — 타임아웃·네트워크로 끊겨 KIS 가 받았는지 모르는 주문.
      TradingOrderLog.countDocuments({ runId: existing._id, dryRun: false, orderNo: UNKNOWN_ACK }),
    ]);
    if (!canRetryRun(existing, sent, unknown)) return null;
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
      if (!isDue({ runAt: cycle.at, weekdaysOnly: p.weekdaysOnly, enabled: p.enabled,
                   phase: cycle.phase }, clock)) continue;

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

/**
 * 어제 돌았어야 할 사이클이 비었는지 — **순수** (#521).
 *
 * 사이클이 **아예 안 돈 날**을 잡는 장치가 없었다. 실측으로 2026-09-04 미장 하루가
 * run·메일·에러 0건으로 통째 유실됐다(호스트 다운 + catch-up 90분 상한 + 다음 날 토요일).
 * 어디에도 흔적이 없으니 운영자는 시스템이 돌고 있다고 믿는다.
 *
 * ⚠ `CATCH_UP_WINDOW_MIN` 을 늘려 고치면 안 된다 — 늘리면 복구된 사이클이 마감 후에
 *   LOC 를 내보내 종가가 아닌 엉뚱한 가격에 걸린다. 고칠 지점은 **감지·통보**다.
 *
 * `ranDates` 는 그 포트폴리오의 run 이 있는 dateKey 목록(YYYY-MM-DD).
 * 돌았어야 했는데 없는 날을 돌려준다(없으면 빈 배열).
 */
export function missingRunDates(
  p: { market: string; weekdaysOnly?: boolean | null },
  runs: { dateKey: string; phase: string; status: string }[],
  todayKey: string,
  /** 그 날 돌았어야 할 phase 들(cyclesFor 가 정한다). */
  needPhases: string[],
): string[] {
  // **done 인 phase 만** '돌았다' 로 센다 (#525). 예전엔 run 문서가 있기만 하면 넘어가서,
  // `running` 1건이 그날(sell+buy+close) 전체를 가렸다 — 운영 DB 에 그런 문서가 실제로 있다.
  const doneBy = new Map<string, Set<string>>();
  for (const r of runs) {
    if (r.status !== "done") continue;
    if (!doneBy.has(r.dateKey)) doneBy.set(r.dateKey, new Set());
    doneBy.get(r.dateKey)!.add(r.phase);
  }
  const d = new Date(`${todayKey}T12:00:00Z`);
  // 어제부터 거슬러 올라가며 '돌았어야 할 가장 가까운 날' 하나를 찾는다.
  for (let i = 1; i <= 7; i++) {
    const c = new Date(d.getTime() - i * 86_400_000);
    const dow = c.getUTCDay();
    if (p.weekdaysOnly !== false && (dow === 0 || dow === 6)) continue;
    const key = c.toISOString().slice(0, 10);
    const done = doneBy.get(key) ?? new Set<string>();
    return needPhases.every((ph) => done.has(ph)) ? [] : [key];
  }
  return [];
}

/**
 * 어제 사이클이 비었으면 메일로 알린다 (#521) — 부수효과 경계.
 *
 * 돌지 **않은** 것은 어디에도 흔적이 없다. run 도 로그도 메일도 0건이라, 지금까지는 사람이
 * 한참 뒤에야 알았다(2026-09-04 미장 하루가 그렇게 유실됐다). 기동할 때마다 한 번 본다 —
 * 호스트가 죽었다 살아나는 경우가 바로 그 상황이다.
 *
 * 실패는 삼킨다. 점검 때문에 스케줄러가 안 뜨면 안 된다.
 */
/**
 * 창 밖에서 멈춘 사이클을 **통보만** 한다 (#525) — 부수효과 경계.
 *
 * stale→failed 전환은 `claimRun` 안에 있고 `claimRun` 은 `isDue` 게이트 뒤에서만 불린다.
 * 그래서 **매매 창(runAt+45~90분)을 넘긴 다운은 중단 메일이 구조적으로 불가능**했다.
 * 보유가 있는 날 익절 지정가·사다리가 전부 빠졌는데 운영자는 정상으로 본다.
 *
 * ⚠ **재클레임은 열지 않는다.** close 사이클 실측 325초, 유니버스 스캔은 수 분이다 —
 *   살아 있는 런을 stale 로 보고 다시 잡으면 중복 주문이 난다. 여기서는 알리기만 하고,
 *   재시도는 종전대로 창 안의 `claimRun` 이 가드(접수·접수불명 수)를 보고 정한다.
 */
async function sweepStuckRuns(): Promise<void> {
  try {
    await connectToDB();
    const cutoff = new Date(Date.now() - STALE_MS);
    const stuck = await TradingRun.find({
      status: "running", startedAt: { $lt: cutoff }, stuckNotifiedAt: null,
    }).select({ portfolioId: 1, accountId: 1, dateKey: 1, phase: 1, startedAt: 1 })
      .limit(20).lean();
    if (!stuck.length) return;
    for (const r of stuck) {
      // **status 를 바꾸지 않는다.** failed 로 내리면 창 안의 claimRun 이 재클레임할 수 있고,
      // 아직 살아 있는 장시간 사이클이었다면 **중복 주문**이 난다(close 실측 325초).
      // 알림 표식만 찍어 중복 통보를 막는다 — 상태 판단은 종전 경로가 그대로 한다.
      const flipped = await TradingRun.updateOne(
        { _id: r._id, status: "running", stuckNotifiedAt: null },
        { $set: { stuckNotifiedAt: new Date() } },
      );
      if (!flipped.modifiedCount) continue; // 다른 인스턴스가 먼저 알렸다
      const [pf, acct] = await Promise.all([
        TradingPortfolio.findById(r.portfolioId).select({ market: 1, strategy: 1, config: 1 }).lean(),
        TradingAccount.findById(r.accountId).select({ envKey: 1 }).lean(),
      ]);
      const n = staleRunNotice(
        {
          envKey: String((acct as { envKey?: string } | null)?.envKey ?? r.accountId),
          market: String((pf as { market?: string } | null)?.market ?? "?"),
          strategy: String((pf as { strategy?: string } | null)?.strategy ?? "?"),
          symbol: (pf as { config?: { symbol?: string } } | null)?.config?.symbol,
        },
        String(r.dateKey), String(r.phase), r.startedAt as Date,
      );
      const { sendTradingMail } = await import("./mailer");
      await sendTradingMail(n.subject, n.body);
    }
  } catch (e) {
    console.warn("[trading] 중단 사이클 점검 실패(삼킴):", e instanceof Error ? e.message : e);
  }
}

async function reportMissingRuns(): Promise<void> {
  try {
    await connectToDB();
    const ports = await TradingPortfolio.find({ isDeleted: { $ne: true }, enabled: true })
      .select({ market: 1, strategy: 1, weekdaysOnly: 1, runAt: 1, config: 1 }).lean();
    const missing: string[] = [];
    for (const p of ports) {
      const market = p.market as "kr" | "us";
      const todayKey = marketClock(market).dateKey;
      const runs = await TradingRun.find({ portfolioId: p._id })
        .select({ dateKey: 1, phase: 1, status: 1 }).sort({ _id: -1 }).limit(30).lean();
      // 그 날 돌았어야 할 phase 는 cyclesFor 가 정한다(국장 v4 는 sell/buy/close 3개).
      const need = cyclesFor({
        strategy: String(p.strategy), market, runAt: String(p.runAt ?? "09:30"),
      }).map((c) => c.phase);
      const gaps = missingRunDates(
        { market, weekdaysOnly: p.weekdaysOnly as boolean | undefined },
        runs.map((r) => ({ dateKey: String(r.dateKey), phase: String(r.phase), status: String(r.status) })),
        todayKey, need,
      );
      const sym = (p.config as { symbol?: string } | undefined)?.symbol ?? "";
      for (const d of gaps) missing.push(`${market}/${p.strategy}${sym ? ` ${sym}` : ""} — ${d}`);
    }
    if (!missing.length) return;
    console.warn("[trading] 결손 사이클:", missing.join(" · "));
    const { sendTradingMail } = await import("./mailer");
    await sendTradingMail(
      `⚠ 사이클 결손 ${missing.length}건 — 돌았어야 할 날에 실행 기록이 없습니다`,
      "아래 블록은 그날 사이클이 **아예 실행되지 않았습니다**(주문·메일·에러 모두 없음).\n"
      + "호스트 다운이나 배포 중단일 수 있습니다. 보유가 있으면 익절 주문도 안 나갔습니다.\n\n"
      + missing.join("\n"),
    );
  } catch (e) {
    console.warn("[trading] 결손 점검 실패(삼킴):", e instanceof Error ? e.message : e);
  }
}

/**
 * 죽은 사이클(stale running → failed) 알림 문구 — **순수** (#523).
 *
 * 실패 메일이 `run_cycle` 의 **in-process catch** 안에만 있었다. 그래서 `systemctl stop`
 * (TimeoutStopSec=30)이나 크래시로 죽은 런은 catch 에 도달하지 못하고, 다음 틱의
 * stale→failed 전환은 `updateOne` 뿐이라 **아무에게도 안 알렸다.** 배포마다 생기는 경로다.
 */
export function staleRunNotice(
  p: { envKey: string; market: string; strategy: string; symbol?: string },
  dateKey: string, phase: string, startedAt: Date,
): { subject: string; body: string } {
  const who = `${p.envKey} ${p.market}/${p.strategy}${p.symbol ? ` ${p.symbol}` : ""}`;
  return {
    subject: `⚠ 사이클 중단 ${dateKey}/${phase} — ${who}`,
    body: `${who} 의 ${dateKey} ${phase} 사이클이 **끝나지 않은 채 사라졌습니다.**\n`
      + `시작: ${startedAt.toISOString()}\n\n`
      + "프로세스가 죽은 것으로 봅니다(배포·재시작·크래시·OOM). 그 사이클의 주문이 어디까지\n"
      + "나갔는지는 주문 원장을 확인하세요 — 이미 접수된 주문이 있으면 그날은 재시도하지\n"
      + "않습니다(중복 주문 방지).",
  };
}

/**
 * KIS 체결의 **KST 시각**을 그 시장의 날짜로 옮긴다 — **순수** (#527).
 *
 * 실측으로 확정했다. `inquire-ccnl` 원시 행:
 *
 *   {"pdno":"TQQQ","ord_dt":"20261001","ord_tmd":"223600","dmst_ord_dt":"20261001"}
 *
 * 그 주문은 2026-10-01 **13:36 UTC = 09:36 EDT** 에 나갔다 → `223600` 은 **22:36 KST** 다.
 * 즉 해외 체결의 날짜·시각 필드가 전부 한국시각이다. 그런데 엔진의 `today` 는 ET 라
 * (`marketToday("us")`), 둘을 그대로 비교하면 KST 자정을 넘긴 체결이 '내일' 로 들어온다.
 *
 * KST 자정은 EDT 로 11:00 ET, **EST 로 10:00 ET** 다:
 *
 *   us v4 09:35 ET  — 지금은 catch-up(+90분)이 11:05 ET 까지라 5분 노출,
 *                     EST 부터는 10:00~11:05 ET 65분으로 넓어진다
 *   us VR 10:50 ET  — EDT 는 같은 날(23:50 KST), **EST 는 00:50 KST 익일 → 매일 어긋난다**
 *
 * 키가 어긋나면 `pendingByDate[fillDate]` 가 `emptyPending()` 을 돌려줘 **cycleCash 만 깎이고
 * t 는 안 오른다** — 회차가 조용히 멈추고 status=done 으로 찍힌다.
 *
 * 국장은 체결도 `today` 도 KST 라 변환이 항등이다(그래도 같은 함수를 통과시킨다 —
 * 시장별 분기를 호출부마다 두면 또 어긋난다).
 */
export function fillMarketDate(ordDate: string, ordTime: string, market: string): string {
  const d = String(ordDate ?? "").trim();
  if (d.length < 8) return "";
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  if (market !== "us") return iso; // 국장은 양쪽 KST
  const raw = String(ordTime ?? "").trim();
  if (!raw) return iso; // 시각이 없으면 변환할 근거가 없다(패딩하면 00:00 과 구분이 안 된다)
  const tm = raw.padStart(6, "0").slice(0, 6);
  if (!/^\d{6}$/.test(tm)) return iso;
  // KST(UTC+9) 벽시계 → UTC → ET 날짜
  const utc = Date.UTC(
    Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)),
    Number(tm.slice(0, 2)) - 9, Number(tm.slice(2, 4)), Number(tm.slice(4, 6)),
  );
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(utc));
}

/** 접수 불명 주문의 원장 표식 — 거부("")와 **다른 값**이어야 가드가 가린다 (#525). */
export const UNKNOWN_ACK = "?";

/**
 * 이 실패가 "증권사가 받았는지 모르는" 종류인가 — **순수** (#525).
 *
 * 주문 POST 가 타임아웃(#523 이 넣은 45초)이나 네트워크 오류로 끊기면 요청이 KIS 에
 * 도달했는지 알 수 없다. 그런데 엔진은 이걸 다른 거부와 똑같이 `orderNo: ""` 로 적었고,
 * 재시도 가드는 **접수된 것만** 세므로 "주문 안 나갔다" 로 읽고 같은 수량을 다시 냈다.
 *
 * 증권사가 코드로 거부한 것(잔고부족·계좌·유량)은 **안 나간 게 분명**하므로 여기 해당 없다.
 * 애매하면 false 로 둔다 — 과잉 차단은 그날 매매를 통째로 포기시킨다.
 */
export function isUnknownAck(message: string): boolean {
  const m = message ?? "";
  if (!m) return false;
  // 증권사가 분명히 답한 것(코드가 붙은 거부)은 접수 불명이 아니다.
  if (/\b(?:EGW|OPSQ|MCA)\d|\b4\d{7}\b|\b9\d{7}\b/.test(m)) return false;
  return /timeout|timed out|aborted|abort|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|network/i
    .test(m);
}

// ── 기동(instrumentation 에서 호출) ──────────────────────────────

declare global {
  var __tradingSchedulerStarted: boolean | undefined;
  var __tradingTickRunning: boolean | undefined;
}

export function startTradingScheduler(): void {
  // **명시적 opt-in** (#507). 예전엔 `=== "false"` 일 때만 꺼서, env 를 읽는 아무 node
  // 프로세스나(`pnpm dev` 포함) 실주문 주체가 됐다 — 프로덕션과 중복 주문이 나갈 수 있다.
  if (process.env.TRADING_SCHEDULER_ENABLED !== "true") {
    console.log("[trading] 스케줄러 비활성 — TRADING_SCHEDULER_ENABLED=true 여야 돈다");
    return;
  }
  if (globalThis.__tradingSchedulerStarted) return; // dev HMR·중복 register 가드
  globalThis.__tradingSchedulerStarted = true;
  // 재진입 가드 — 장시간 사이클(미장 유니버스 스캔 ~수 분)이 60초 틱과 겹쳐
  // 동시 실행되면 KIS 유량이 폭주한다. 실행 중이면 이번 틱은 건너뛴다(클레임과 별개의
  // 프로세스 내 직렬화 — 놓친 사이클은 다음 틱의 catch-up 이 줍는다).
  const safeTick = async () => {
    if (globalThis.__tradingTickRunning) return;
    globalThis.__tradingTickRunning = true;
    try {
      await sweepStuckRuns(); // 창 밖 중단 통보 (#525) — 재클레임은 안 한다
      await tradingTick();
    } catch (e) {
      console.error("[trading] tick 실패:", e);
    } finally {
      globalThis.__tradingTickRunning = false;
    }
  };
  // 기동 직후 **결손 점검** (#521) — 어제 돌았어야 할 사이클이 비었으면 메일. 실패는 삼킨다.
  setTimeout(() => { void reportMissingRuns(); }, 20_000);
  // 첫 틱 = 기동 catch-up. DB/설정 미비 등 어떤 실패도 서버를 죽이지 않는다.
  setTimeout(safeTick, 10_000); // 서버 워밍업 직후
  setInterval(safeTick, TICK_MS);
  console.log("[trading] 스케줄러 시작 — 60초 틱, catch-up 포함");
}

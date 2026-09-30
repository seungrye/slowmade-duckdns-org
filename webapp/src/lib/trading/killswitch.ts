/**
 * 킬스위치 — 신규 주문을 즉시 끊고, 오늘 우리가 낸 주문을 거둔다 (#509·#498).
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────
 *
 * `liveEnabled=false` 는 **신규 주문만** 막는다. 이미 나간 지정가·LOC 는 살아 있고, 취소
 * 코드는 사이클 안에만 있어 운영자가 부를 경로가 없었다. 사고가 나면 증권사 HTS 로 직접
 * 들어가야 했다.
 *
 * ── 설계 제약 셋 (#498 에 기록해 둔 것) ───────────────────────────
 *
 * **① `live` 가 사이클당 한 번만 계산된다.** 토글을 꺼도 **도는 사이클은 계속 주문한다** —
 *    VR 은 사다리를 1초 간격으로 20건 넘게 내므로 그 구간이 통째로 뚫린다. 그래서
 *    `stillLive()` 를 엔진에 주입해 **주문 직전마다 다시 확인**한다. 이게 없으면 버튼은
 *    연출이지 통제가 아니다.
 *
 * **② 미체결 조회로 취소하면 사람 주문까지 지운다.** `krOpenOrders()` 는 `PDNO: ""` 로
 *    계좌 전체를 가져온다 — HTS 에서 직접 낸 주문도 포함된다. 그래서 **우리 주문 원장**
 *    (`TradingOrderLog`)에서 오늘 낸 것만 취소한다. 덤으로 미장 거래소도 정확해진다
 *    (원장에 symbol 이 있으니 `usExcd(sym)` 로 정확히 친다 — #489 와 같은 이유).
 *
 * **③ 취소가 느리다.** throttle 1초 × 주문 수 ≈ 30초. 그래서 순서를 나눈다 —
 *    ① `liveEnabled=false` **즉시**(신규 차단) → ② 취소를 건별로 진행. ①이 끝나는 순간
 *    지혈은 된다.
 */

import TradingAccount from "@/models/trading-account";
import TradingOrderLog from "@/models/trading-order-log";
import type { Types } from "mongoose";

/** 주문 직전 재확인용 — 엔진이 매 주문 전에 부른다. DB 를 새로 읽는다(캐시 금지). */
export async function isStillLive(accountId: Types.ObjectId | string): Promise<boolean> {
  if (process.env.TRADING_LIVE_ALLOWED !== "true") return false;
  const a = await TradingAccount.findById(accountId).select({ liveEnabled: 1 }).lean();
  return Boolean(a?.liveEnabled);
}

export type KillResult = {
  disabled: string[];          // 실주문을 끈 계정 envKey
  cancelled: { envKey: string; symbol: string; orderNo: string }[];
  failed: { orderNo: string; error: string }[];
  scanned: number;             // 취소를 시도한 주문 수
};

/** `Date` 를 그 시장 tz 의 "YYYYMMDD" 로 — 오늘 낸 주문만 고르기 위한 것. */
function marketDateKey(market: string, now: Date): string {
  const tz = market === "kr" ? "Asia/Seoul" : "America/New_York";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now).replace(/-/g, "");
}

/**
 * 오늘 낸 실주문 중 **취소 후보**를 고른다 — 순수.
 *
 * 시장가는 즉시 체결되므로 취소 대상이 아니고, 거부된 주문(`orderNo` 없음)은 애초에 없다.
 * 같은 주문번호가 여러 번 기록됐을 수 있으니(재푸시) 중복을 제거한다.
 */
export function cancellableOrders<T extends {
  orderNo?: string; ordType?: string; dryRun?: boolean;
  market?: string; symbol?: string; envKey?: string; createdAt?: Date;
}>(logs: T[], now: Date): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const l of logs) {
    if (l.dryRun) continue;
    if (!l.orderNo) continue;              // 거부된 주문 — 거둘 것이 없다
    if (l.ordType === "market") continue;  // 시장가는 이미 체결됐다
    if (!l.createdAt || !l.market) continue;
    // 오늘(시장 tz) 낸 것만. 어제 LOC 는 종가에 자동 소멸했다.
    if (marketDateKey(l.market, l.createdAt) !== marketDateKey(l.market, now)) continue;
    const k = `${l.envKey}|${l.orderNo}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
  }
  return out;
}

/**
 * 킬스위치 실행 — 부수효과 경계.
 *
 * `cancel` 은 호출측이 주입한다(브로커를 이 모듈이 알면 안 된다). 한 건 실패가 나머지를
 * 막지 않게 **주문 단위로 격리**하고, 실패도 결과에 담아 돌려준다 — 조용히 넘기면
 * "다 거뒀다" 로 읽힌다.
 */
export async function killSwitch(opts: {
  now: Date;
  cancel: (o: { envKey: string; market: string; symbol: string; orderNo: string; qty: number })
    => Promise<void>;
  log?: (line: string) => void;
}): Promise<KillResult> {
  const log = opts.log ?? (() => {});
  const result: KillResult = { disabled: [], cancelled: [], failed: [], scanned: 0 };

  // ── ① 신규 차단이 먼저다. 이게 끝나는 순간 지혈은 된다.
  const accounts = await TradingAccount.find({ isDeleted: { $ne: true }, liveEnabled: true }).lean();
  if (accounts.length) {
    await TradingAccount.updateMany(
      { _id: { $in: accounts.map((a) => a._id) } },
      { $set: { liveEnabled: false } },
    );
    result.disabled = accounts.map((a) => String(a.envKey));
    log(`실주문 차단: ${result.disabled.join(", ")}`);
  } else {
    log("실주문이 켜진 계정이 없다 — 차단할 것 없음");
  }

  // ── ② 오늘 우리가 낸 주문을 거둔다. 계좌 전체 미체결이 아니라 **우리 원장**이 기준이다.
  const since = new Date(opts.now.getTime() - 36 * 3600_000); // tz 차이를 넉넉히 덮는다
  const logs = await TradingOrderLog.find({ dryRun: false, createdAt: { $gte: since } })
    .sort({ createdAt: -1 }).lean();
  const targets = cancellableOrders(logs as never[], opts.now);
  result.scanned = targets.length;
  log(`취소 후보 ${targets.length}건(우리 원장의 오늘 지정가·LOC)`);

  for (const t of targets as unknown as {
    envKey: string; market: string; symbol: string; orderNo: string; qty: number;
  }[]) {
    try {
      await opts.cancel(t);
      result.cancelled.push({ envKey: t.envKey, symbol: t.symbol, orderNo: t.orderNo });
      log(`취소 ${t.symbol} ${t.orderNo}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.failed.push({ orderNo: t.orderNo, error: msg });
      log(`⚠ 취소 실패 ${t.symbol} ${t.orderNo}: ${msg}`);
    }
  }
  return result;
}

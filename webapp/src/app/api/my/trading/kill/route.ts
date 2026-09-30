import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import TradingAccount from "@/models/trading-account";
import { killSwitch } from "@/lib/trading/killswitch";
import { makeKisClient, makeTossClient } from "@/lib/trading/engines";
import { US_ORDER_EXCD, usQuoteExcd } from "@/lib/trading/kis-client";
import { appendLiveLog, liveChangeEntry } from "@/lib/trading/live-audit";

export const dynamic = "force-dynamic";

/**
 * 킬스위치 — 실주문을 즉시 끊고 오늘 우리가 낸 주문을 거둔다 (#509·#498). owner 전용.
 *
 * 순서가 중요하다: **① 신규 차단이 먼저**다(즉시 끝난다), ② 취소는 주문당 ~1초라
 * 20건이면 30초쯤 걸린다. ①이 끝나는 순간 지혈은 되므로, 취소가 느려도 새 주문은 안 나간다.
 *
 * 취소 대상은 **우리 주문 원장**의 오늘 지정가·LOC 다. 계좌 전체 미체결로 하면 사람이
 * HTS 에서 직접 낸 주문까지 지운다.
 */
export async function POST() {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  await connectToDB();

  const logs: string[] = [];
  const log = (line: string) => logs.push(`${new Date().toISOString()} ${line}`);

  // 계정별 브로커를 미리 만들어 둔다(취소 때마다 새로 만들면 토큰을 다시 읽는다).
  const accounts = await TradingAccount.find({ isDeleted: { $ne: true } }).lean();
  const byEnvKey = new Map(accounts.map((a) => [String(a.envKey), a]));

  const result = await killSwitch({
    now: new Date(),
    log,
    cancel: async (o) => {
      const acct = byEnvKey.get(o.envKey);
      if (!acct) throw new Error(`계정을 못 찾음: ${o.envKey}`);
      if (acct.broker === "toss") {
        await makeTossClient(acct as never).cancelOrder(o.orderNo);
        return;
      }
      const kis = makeKisClient(acct as never);
      if (o.market === "kr") await kis.krCancelOrder(o.orderNo, o.qty);
      // 미장은 종목 거래소로 취소해야 잡힌다(#489 와 같은 이유) — 원장에 symbol 이 있다.
      else await kis.usCancelOrder(o.symbol, o.orderNo, o.qty,
                                   US_ORDER_EXCD[usQuoteExcd(o.symbol)] ?? "NASD");
    },
  });

  // 누가 껐는지 남긴다 (#493 과 같은 원칙 — 실주문 스위치는 이력이 있어야 한다).
  for (const envKey of result.disabled) {
    const a = byEnvKey.get(envKey);
    if (!a) continue;
    const entry = liveChangeEntry(true, false, owner.email, new Date());
    if (!entry) continue;
    await TradingAccount.updateOne(
      { _id: a._id },
      { $set: { liveLog: appendLiveLog(a.liveLog as never, entry) } },
    ).catch(() => {}); // 이력 실패가 킬스위치를 막지 않는다
  }

  log(`완료 — 차단 ${result.disabled.length}계정 · 취소 ${result.cancelled.length}/${result.scanned}건`
    + (result.failed.length ? ` · 실패 ${result.failed.length}건` : ""));

  return NextResponse.json({ ok: result.failed.length === 0, ...result, logs });
}

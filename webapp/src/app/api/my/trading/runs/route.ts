import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import TradingRun from "@/models/trading-run";
import TradingOrderLog from "@/models/trading-order-log";
import TradingPortfolio from "@/models/trading-portfolio";
import TradingAccount from "@/models/trading-account";
import { runPortfolioCycle } from "@/lib/trading/engines";

export const dynamic = "force-dynamic";

/** 실행 이력·주문 로그 조회 + 수동 실행(run-now, 테스트용 dry). owner 전용. */

export async function GET(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  await connectToDB();
  const q = accountId ? { accountId } : {};
  const runs = await TradingRun.find(q).sort({ createdAt: -1 }).limit(20).lean();
  const orders = await TradingOrderLog.find(q).sort({ createdAt: -1 }).limit(30).lean();
  return NextResponse.json({
    runs: runs.map((r) => ({
      id: String(r._id), portfolioId: String(r.portfolioId), dateKey: r.dateKey,
      status: r.status, dryRun: r.dryRun, catchUp: r.catchUp, summary: r.summary,
      error: r.error, startedAt: r.startedAt, finishedAt: r.finishedAt,
      logs: (r.logs ?? []).slice(-30),
    })),
    orders: orders.map((o) => ({
      id: String(o._id), envKey: o.envKey, market: o.market, strategy: o.strategy,
      symbol: o.symbol, side: o.side, qty: o.qty, price: o.price,
      dryRun: o.dryRun, orderNo: o.orderNo, reason: o.reason,
      at: (o as { createdAt?: Date }).createdAt,
    })),
  });
}

/** 수동 1회 실행 — 멱등 키를 "manual-{ts}" 로 별도 발급(당일 정규 실행과 충돌 없음).
 *  설정 검증용이므로 **항상 dry-run 으로 강제**한다(liveEnabled 와 무관). */
export async function POST(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const body = await req.json();
  const portfolioId = String(body.portfolioId ?? "");
  await connectToDB();
  const portfolio = await TradingPortfolio.findById(portfolioId).lean();
  if (!portfolio) return NextResponse.json({ error: "포트폴리오 없음" }, { status: 404 });
  const account = await TradingAccount.findById(portfolio.accountId).lean();
  if (!account) return NextResponse.json({ error: "계정 없음" }, { status: 404 });

  const run = await TradingRun.create({
    portfolioId, accountId: portfolio.accountId,
    dateKey: `manual-${Date.now()}`, status: "running", dryRun: true, catchUp: false,
  });
  const logs: string[] = [];
  const log = (line: string) => logs.push(`${new Date().toISOString()} ${line}`);
  try {
    // 수동 실행은 라이브 게이트를 우회하지 않도록 liveEnabled 를 강제로 끈 사본으로 돈다.
    const dryAccount = { ...account, liveEnabled: false };
    const summary = await runPortfolioCycle(
      dryAccount as never, portfolio as never, run._id as never, log,
    );
    await TradingRun.updateOne(
      { _id: run._id },
      { $set: { status: "done", summary, logs, finishedAt: new Date() } },
    );
    return NextResponse.json({ ok: true, summary, logs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await TradingRun.updateOne(
      { _id: run._id },
      { $set: { status: "failed", error: msg, logs, finishedAt: new Date() } },
    );
    return NextResponse.json({ ok: false, error: msg, logs }, { status: 500 });
  }
}

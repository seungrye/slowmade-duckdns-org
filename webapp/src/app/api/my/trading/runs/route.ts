import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import TradingRun from "@/models/trading-run";
import TradingOrderLog from "@/models/trading-order-log";
import TradingPortfolio from "@/models/trading-portfolio";
import TradingAccount from "@/models/trading-account";
import { runPortfolioCycle } from "@/lib/trading/engines";

export const dynamic = "force-dynamic";

/** Reading the run history and order log, plus a manual run (run-now, a dry run for testing). Owner only. */

export async function GET(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  const numParam = (k: string, def: number, max: number) =>
    Math.min(Math.max(0, Number(url.searchParams.get(k) ?? def) || 0), max);
  // The run history and the order log are paged independently (page is 0-based).
  const runsPage = numParam("runsPage", 0, 100000);
  const ordersPage = numParam("ordersPage", 0, 100000);
  const runsSize = Math.max(1, numParam("runsSize", 15, 50));
  const ordersSize = Math.max(1, numParam("ordersSize", 25, 100));
  await connectToDB();
  const q = accountId ? { accountId } : {};
  const [runs, orders, runsTotal, ordersTotal] = await Promise.all([
    TradingRun.find(q).sort({ createdAt: -1 }).skip(runsPage * runsSize).limit(runsSize).lean(),
    TradingOrderLog.find(q).sort({ createdAt: -1 }).skip(ordersPage * ordersSize).limit(ordersSize).lean(),
    TradingRun.countDocuments(q),
    TradingOrderLog.countDocuments(q),
  ]);
  return NextResponse.json({
    runsTotal, ordersTotal, runsPage, ordersPage, runsSize, ordersSize,
    runs: runs.map((r) => ({
      id: String(r._id), portfolioId: String(r.portfolioId), dateKey: r.dateKey,
      phase: (r as { phase?: string }).phase ?? "main",
      status: r.status, dryRun: r.dryRun, catchUp: r.catchUp, summary: r.summary,
      error: r.error, startedAt: r.startedAt, finishedAt: r.finishedAt,
      logs: (r.logs ?? []).slice(-30),
    })),
    orders: orders.map((o) => ({
      id: String(o._id), envKey: o.envKey, market: o.market, strategy: o.strategy,
      symbol: o.symbol, side: o.side, qty: o.qty, price: o.price, ordType: o.ordType,
      dryRun: o.dryRun, orderNo: o.orderNo, reason: o.reason,
      at: (o as { createdAt?: Date }).createdAt,
    })),
  });
}

/** A single manual run - it takes its own idempotency key, "manual-{ts}" (never colliding with the day's scheduled run).
 *  Being for verifying the settings, it is **always forced to a dry run** (regardless of liveEnabled). */
export async function POST(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const body = await req.json();
  const portfolioId = String(body.portfolioId ?? "");
  await connectToDB();
  const portfolio = await TradingPortfolio.findOne({ _id: portfolioId, isDeleted: { $ne: true } }).lean();
  if (!portfolio) return NextResponse.json({ error: "포트폴리오 없음" }, { status: 404 });
  const account = await TradingAccount.findOne({ _id: portfolio.accountId, isDeleted: { $ne: true } }).lean();
  if (!account) return NextResponse.json({ error: "계정 없음" }, { status: 404 });

  const run = await TradingRun.create({
    portfolioId, accountId: portfolio.accountId,
    dateKey: `manual-${Date.now()}`, status: "running", dryRun: true, catchUp: false,
  });
  const logs: string[] = [];
  const log = (line: string) => logs.push(`${new Date().toISOString()} ${line}`);
  try {
    // A manual run uses a copy with liveEnabled forced off, so it cannot bypass the live gate.
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

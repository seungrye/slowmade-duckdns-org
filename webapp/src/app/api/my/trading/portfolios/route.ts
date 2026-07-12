import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import TradingPortfolio from "@/models/trading-portfolio";

export const dynamic = "force-dynamic";

/** 포트폴리오 블록(계정×시장×전략) CRUD — owner 전용. */

export async function GET(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const accountId = new URL(req.url).searchParams.get("accountId");
  await connectToDB();
  const q = accountId ? { accountId } : {};
  const rows = await TradingPortfolio.find(q).sort({ createdAt: 1 }).lean();
  return NextResponse.json({
    portfolios: rows.map((p) => ({
      id: String(p._id),
      accountId: String(p.accountId),
      market: p.market,
      strategy: p.strategy,
      runAt: p.runAt,
      weekdaysOnly: p.weekdaysOnly,
      enabled: p.enabled,
      config: p.config ?? {},
      state: p.state ?? {},
    })),
  });
}

export async function POST(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const body = await req.json();
  const market = String(body.market ?? "");
  const strategy = String(body.strategy ?? "");
  if (!["kr", "us"].includes(market)) {
    return NextResponse.json({ error: "market 은 kr|us" }, { status: 400 });
  }
  if (!["lrs_v1", "rotation_v1", "trend_v1"].includes(strategy)) {
    return NextResponse.json({ error: "strategy 는 lrs_v1|rotation_v1|trend_v1 (무한매수는 2단계)" }, { status: 400 });
  }
  const runAt = String(body.runAt ?? (market === "kr" ? "09:05" : "09:35"));
  if (!/^\d{2}:\d{2}$/.test(runAt)) {
    return NextResponse.json({ error: "runAt 은 HH:MM" }, { status: 400 });
  }
  await connectToDB();
  // 계정당 시장 1블록 — upsert (기존 블록 갱신 시 state 는 보존)
  const doc = await TradingPortfolio.findOneAndUpdate(
    { accountId: body.accountId, market },
    {
      $set: {
        strategy, runAt,
        weekdaysOnly: body.weekdaysOnly !== false,
        enabled: body.enabled !== false,
        config: body.config ?? {},
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return NextResponse.json({ id: String(doc._id) });
}

export async function DELETE(req: NextRequest) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const id = String(new URL(req.url).searchParams.get("id") ?? "");
  await connectToDB();
  await TradingPortfolio.deleteOne({ _id: id });
  return NextResponse.json({ ok: true });
}

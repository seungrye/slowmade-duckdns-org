import { NextRequest, NextResponse } from "next/server";
import { requireIngestKey } from "@/lib/require-ingest-key";
import { connectToDB } from "@/lib/db";
import PortfolioHistory from "@/models/portfolio-history";

export const dynamic = "force-dynamic";

type Entry = {
  env: "paper" | "real";
  currency?: string;
  date: string; // ISO
  dateStr: string; // YYYY-MM-DD
  totalValue: number;
  cash?: number;
  holdingsValue?: number;
  runPnl?: number;
  cumulativePnl?: number;
};

const MAX = 200;

export async function POST(req: NextRequest) {
  const guard = requireIngestKey(req);
  if (guard) return guard;

  let body: { entries?: Entry[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "bad json" }, { status: 400 });
  }
  const entries = (body.entries ?? []).slice(0, MAX);
  if (entries.length === 0) return NextResponse.json({ upserted: 0 });

  await connectToDB();
  const ops = entries
    .filter(
      (e) =>
        e &&
        (e.env === "paper" || e.env === "real") &&
        typeof e.date === "string" &&
        typeof e.dateStr === "string" &&
        typeof e.totalValue === "number",
    )
    .map((e) => ({
      updateOne: {
        filter: { env: e.env, currency: e.currency ?? "KRW", date: e.date },
        update: {
          $set: {
            env: e.env,
            currency: e.currency ?? "KRW",
            date: e.date,
            dateStr: e.dateStr,
            totalValue: e.totalValue,
            cash: e.cash ?? 0,
            holdingsValue: e.holdingsValue ?? 0,
            runPnl: e.runPnl ?? 0,
            cumulativePnl: e.cumulativePnl ?? 0,
          },
          $currentDate: { updatedAt: true },
        },
        upsert: true,
      },
    }));
  if (ops.length === 0) return NextResponse.json({ upserted: 0 });
  try {
    const r = await PortfolioHistory.collection.bulkWrite(ops as never, { ordered: false });
    return NextResponse.json({
      upserted: (r.upsertedCount ?? 0) + (r.modifiedCount ?? 0),
      received: entries.length,
    });
  } catch (e) {
    return NextResponse.json(
      { message: "bulkWrite failed", error: (e as Error).message },
      { status: 500 },
    );
  }
}

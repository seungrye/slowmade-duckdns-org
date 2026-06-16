import { NextRequest, NextResponse } from "next/server";
import { requireIngestKey } from "@/lib/require-ingest-key";
import { connectToDB } from "@/lib/db";
import StockTrade from "@/models/stock-trade";

export const dynamic = "force-dynamic";

type TradeRecord = {
  env: "paper" | "real";
  ticker: string;
  action: "buy" | "sell";
  qty: number;
  price: number;
  amount?: number;
  currency?: string;
  date: string; // YYYY-MM-DD
  time: string; // ISO
};

const MAX = 1000;

export async function POST(req: NextRequest) {
  const guard = requireIngestKey(req);
  if (guard) return guard;

  let body: { trades?: TradeRecord[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "bad json" }, { status: 400 });
  }
  const trades = (body.trades ?? []).slice(0, MAX);
  if (trades.length === 0) {
    return NextResponse.json({ upserted: 0 });
  }
  await connectToDB();
  const ops = trades
    .filter(
      (t) =>
        t &&
        (t.env === "paper" || t.env === "real") &&
        typeof t.ticker === "string" &&
        (t.action === "buy" || t.action === "sell") &&
        typeof t.time === "string" &&
        typeof t.date === "string",
    )
    .map((t) => ({
      updateOne: {
        filter: { env: t.env, ticker: t.ticker, time: t.time },
        update: {
          $set: {
            env: t.env,
            ticker: t.ticker,
            action: t.action,
            qty: t.qty,
            price: t.price,
            amount: t.amount ?? t.price * t.qty,
            currency: t.currency ?? "KRW",
            date: t.date,
            time: t.time,
          },
          $currentDate: { updatedAt: true },
        },
        upsert: true,
      },
    }));
  if (ops.length === 0) return NextResponse.json({ upserted: 0 });
  try {
    const r = await StockTrade.collection.bulkWrite(ops as never, { ordered: false });
    return NextResponse.json({
      upserted: (r.upsertedCount ?? 0) + (r.modifiedCount ?? 0),
      received: trades.length,
    });
  } catch (e) {
    return NextResponse.json(
      { message: "bulkWrite failed", error: (e as Error).message },
      { status: 500 },
    );
  }
}

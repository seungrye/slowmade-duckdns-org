import { NextRequest, NextResponse } from "next/server";
import { requireIngestKey } from "@/lib/require-ingest-key";
import { connectToDB } from "@/lib/db";
import StockDailyPrice from "@/models/stock-daily-price";

export const dynamic = "force-dynamic";

type PriceRecord = {
  ticker: string;
  date: string; // YYYY-MM-DD
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close: number;
  volume?: number | null;
};

/**
 * POST /api/ingest/prices
 *   header: X-Ingest-Key
 *   body:   { records: [{ticker, date, open, high, low, close, volume}, ...] }
 *
 * stock-automator 가 사이클 끝/buffer flush 시 호출.
 * 최대 5000 record 까지. 더 크면 chunk 분할 권장.
 */
const MAX = 5000;

export async function POST(req: NextRequest) {
  const guard = requireIngestKey(req);
  if (guard) return guard;

  let body: { records?: PriceRecord[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "bad json" }, { status: 400 });
  }
  const records = (body.records ?? []).slice(0, MAX);
  if (records.length === 0) {
    return NextResponse.json({ upserted: 0 });
  }

  await connectToDB();
  const ops = records
    .filter(
      (r) => r && typeof r.ticker === "string" && typeof r.date === "string" && typeof r.close === "number",
    )
    .map((r) => ({
      updateOne: {
        filter: { ticker: r.ticker, date: r.date },
        update: {
          $set: {
            ticker: r.ticker,
            date: r.date,
            close: r.close,
            ...(typeof r.open === "number" ? { open: r.open } : {}),
            ...(typeof r.high === "number" ? { high: r.high } : {}),
            ...(typeof r.low === "number" ? { low: r.low } : {}),
            ...(typeof r.volume === "number" ? { volume: r.volume } : {}),
          },
          $currentDate: { updatedAt: true },
        },
        upsert: true,
      },
    }));
  if (ops.length === 0) return NextResponse.json({ upserted: 0 });

  try {
    const r = await StockDailyPrice.collection.bulkWrite(ops as never, { ordered: false });
    return NextResponse.json({
      upserted: (r.upsertedCount ?? 0) + (r.modifiedCount ?? 0),
      received: records.length,
    });
  } catch (e) {
    return NextResponse.json(
      { message: "bulkWrite failed", error: (e as Error).message },
      { status: 500 },
    );
  }
}

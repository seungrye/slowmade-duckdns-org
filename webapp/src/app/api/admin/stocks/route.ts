import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import Stock from "@/models/stock";

export const dynamic = "force-dynamic";

/** GET /api/admin/stocks — owner 전용 종목 리스트 (JSON). */
export async function GET() {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) return guard;

  await connectToDB();
  const stocks = await Stock.find({ isDeleted: { $ne: true } })
    .select({ ticker: 1, name: 1, market: 1, exchange: 1, indices: 1, _id: 0 })
    .sort({ market: 1, ticker: 1 })
    .lean();
  return NextResponse.json({ stocks });
}

// /api/my/trading/portfolios/[id]/revisions - the settings history list (#350).
//
// Read only. There is no revert - you read the values and type them back into the edit form.

import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import TradingPortfolioRevision from "@/models/trading-portfolio-revision";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Authorisation comes before the DB query - the same reason as the scene revisions route.
export async function GET(_req: NextRequest, { params }: Params) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  await connectToDB();
  const { id } = await params;
  const rows = await TradingPortfolioRevision.find({ portfolioId: id })
    .sort({ version: -1 }).lean();
  return NextResponse.json({
    revisions: rows.map((r) => ({
      version: r.version,
      action: r.action,
      changed: r.changed ?? [],
      snapshot: r.snapshot ?? {},
      createdAt: r.createdAt,
    })),
  });
}

// /api/my/trading/portfolios/[id]/revisions — 설정 이력 목록 (#350).
//
// 보기 전용이다. 되돌리기는 없다 — 값을 보고 편집창에 직접 옮겨 적는다.

import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { connectToDB } from "@/lib/db";
import TradingPortfolioRevision from "@/models/trading-portfolio-revision";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// 인가를 DB 조회보다 먼저 둔다 — 씬 리비전 라우트와 같은 이유.
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

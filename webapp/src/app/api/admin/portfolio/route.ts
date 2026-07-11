import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { getPortfolioData, type Env, type Currency } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/portfolio?env=paper&currency=KRW
 *
 * 반환: { env, currency, history, tradesByDate } — 조회·집계는 lib/portfolio.getPortfolioData.
 * 같은 로직을 /admin/portfolio server component 가 SSR 초기 로드에 재사용한다.
 */
export async function GET(req: NextRequest) {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) return guard;

  const rawEnv = req.nextUrl.searchParams.get("env") ?? "paper";
  const env: Env = /^[a-z0-9][a-z0-9-]{0,40}$/.test(rawEnv) ? rawEnv : "paper";
  const currency: Currency = req.nextUrl.searchParams.get("currency") === "USD" ? "USD" : "KRW";

  const data = await getPortfolioData(env, currency);
  return NextResponse.json(data);
}

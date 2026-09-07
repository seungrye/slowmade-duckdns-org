import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { getPortfolioData, type Env, type Currency } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/portfolio?env=paper&currency=KRW
 *
 * Returns: { env, currency, history, tradesByDate } - the query and aggregation are lib/portfolio.getPortfolioData.
 * The /admin/portfolio server component reuses the same logic for its SSR initial load.
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

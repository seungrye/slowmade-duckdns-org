import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import BacktestClient from "./backtest-client";

export const dynamic = "force-dynamic";

/**
 * /admin/backtest — 무한매수법 백테스트. 연산은 전부 브라우저(client)에서 하고,
 * 서버는 일봉(OHLC)만 /api/admin/backtest/prices 로 내려준다(백엔드 부담 최소).
 */
export default async function BacktestPage() {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) notFound();
  return <BacktestClient />;
}

import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import BacktestClient from "./backtest-client";

export const dynamic = "force-dynamic";

/**
 * /admin/backtest - the infinite-buying backtest. Every computation happens in the browser (the client), and
 * the server serves only the daily bars (OHLC) through /api/admin/backtest/prices (keeping the backend load minimal).
 */
export default async function BacktestPage() {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) notFound();
  return <BacktestClient />;
}

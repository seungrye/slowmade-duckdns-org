import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import TradingMonitorClient from "./monitor-client";

/**
 * /admin/trading/monitor - trading monitoring (the run history and order log). Owner only.
 *
 * The settings live one level up (/admin/trading). They used to be at /dashboard/trading, which split the tree
 * from the settings, and since both are owner-only trading screens they were merged under the stocks menu. The old
 * path remains as a redirect so bookmarks keep working. (#53)
 */
export default async function TradingMonitorPage() {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) notFound();
  return <TradingMonitorClient />;
}

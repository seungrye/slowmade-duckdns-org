import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ ticker: string }> };

/**
 * The single-symbol page redirects to the multi-chart page (with that one symbol selected).
 * It keeps existing bookmarks and links working and unifies the UX.
 */
export default async function StockDetailPage({ params }: PageProps) {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) notFound();
  const { ticker } = await params;
  redirect(`/admin/stocks?tickers=${encodeURIComponent(ticker)}`);
}

import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ ticker: string }> };

/**
 * 단일 종목 페이지 → 멀티 차트 페이지로 redirect (단일 종목 1개 선택 상태).
 * 기존 북마크/링크 호환 + UX 통일.
 */
export default async function StockDetailPage({ params }: PageProps) {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) notFound();
  const { ticker } = await params;
  redirect(`/admin/stocks?tickers=${encodeURIComponent(ticker)}`);
}

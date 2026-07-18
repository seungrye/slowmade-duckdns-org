import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { getPortfolioData, listEnvCurrencies } from "@/lib/portfolio";
import PortfolioChartClient from "./portfolio-chart-client";

export const dynamic = "force-dynamic";

/**
 * /admin/portfolio — owner 전용 매매 차트.
 *
 * env (모의/실전) × currency (KRW/USD) 탭. 각 조합마다 3 line:
 * 추정 총 재산 / 추정 잔여 현금 / 보유 평가액 + 매매 마커 (▲▼■).
 */
export default async function PortfolioPage() {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) notFound();

  // 탭은 숨김 아닌 기록이 실제로 있는 (env, currency) 조합만 — 삭제(숨김)한 조합은 탭에서 사라짐.
  const tabs = await listEnvCurrencies();
  const first = tabs[0] ?? { env: "paper", currency: "KRW" as const };
  const initialData = await getPortfolioData(first.env, first.currency);

  return (
    <main className="mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">매매 차트</h1>
      <p className="text-sm text-gray-500 mb-6">
        owner 전용 · 사이클별 portfolio 시계열 + 매매 마커 (▲ 매수만 / ▼ 매도만 / ■ 둘 다)
      </p>
      <PortfolioChartClient initialData={initialData} tabs={tabs.length ? tabs : [{ env: "paper", currency: "KRW" }]} />
    </main>
  );
}

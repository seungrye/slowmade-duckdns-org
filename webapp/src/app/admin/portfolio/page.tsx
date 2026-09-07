import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { getPortfolioData, listEnvCurrencies } from "@/lib/portfolio";
import PortfolioChartClient from "./portfolio-chart-client";

export const dynamic = "force-dynamic";

/**
 * /admin/portfolio - the owner-only trade chart.
 *
 * Tabs of env (paper/real) x currency (KRW/USD). Each combination gets 3 lines:
 * estimated total assets / estimated remaining cash / holdings value, plus trade markers.
 */
export default async function PortfolioPage() {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) notFound();

  // The tabs cover only the (env, currency) combinations with unhidden records - a hidden combination disappears from the tabs.
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

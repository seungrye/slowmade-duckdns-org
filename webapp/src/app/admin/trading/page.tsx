import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { loadTradingSettings } from "@/lib/trading/settings-data";
import TradingSettingsClient from "./trading-client";

// Live state (the wire toggle and so on), so no caching - SSR on every request. The initial data is injected on the
// server (removing a client-mount fetch round trip and the flicker).
export const dynamic = "force-dynamic";

/**
 * /admin/trading - the owner-only trading settings.
 *
 * They used to be one section inside my-page settings (/dashboard/settings). Owner-only settings sat on a personal
 * settings page meant for ordinary users, and adjusting a parameter while watching the monitor meant leaving the
 * menu. They were split out under the stocks menu. (#47)
 * Monitoring moved from /dashboard/trading to below this one (/admin/trading/monitor) too. (#53)
 */
export default async function TradingSettingsPage() {
    const guard = await requireOwner();
    if (guard instanceof NextResponse) notFound();

    const trading = await loadTradingSettings();
    return (
        <main className="mx-auto px-4 py-6">
            <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">자동매매 설정</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                계좌·전략·실행 시각을 설정합니다. 실행 이력과 주문 로그는{" "}
                <a href="/admin/trading/monitor" className="text-blue-600 hover:underline">
                    자동매매 모니터링
                </a>
                에서 볼 수 있습니다.
            </p>
            <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
                <TradingSettingsClient initial={trading} />
            </div>
        </main>
    );
}

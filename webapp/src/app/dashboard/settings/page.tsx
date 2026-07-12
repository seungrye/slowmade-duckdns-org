import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { loadTradingSettings } from "@/lib/trading/settings-data";
import SettingsFormSection from "./settings-form";
import TradingSettingsClient from "./trading/trading-client";

// 개인 설정 + 자동매매(owner) — 실시간 상태(wire 토글 등)라 캐시 금지, 매 요청 SSR.
// 자동매매 초기 데이터는 서버에서 주입(클라이언트 마운트 fetch 왕복·깜빡임 제거).
// ISR 부적합: owner 전용 개인 데이터. 비소유자에겐 섹션 자체를 렌더하지 않는다(미노출).
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
    const owner = await requireOwner();
    const trading = owner instanceof NextResponse ? null : await loadTradingSettings();
    return (
        <main className="mx-auto px-4 py-6">
            <h1 className="text-3xl font-bold mb-6 text-gray-900">설정</h1>
            <SettingsFormSection />
            {trading && (
                <div className="mt-6 bg-white dark:bg-gray-900 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">자동매매 설정</h2>
                    <TradingSettingsClient initial={trading} />
                </div>
            )}
        </main>
    );
}

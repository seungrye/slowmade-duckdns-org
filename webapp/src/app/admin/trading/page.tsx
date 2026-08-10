import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import { loadTradingSettings } from "@/lib/trading/settings-data";
import TradingSettingsClient from "./trading-client";

// 실시간 상태(wire 토글 등)라 캐시 금지, 매 요청 SSR. 초기 데이터는 서버에서 주입
// (클라이언트 마운트 fetch 왕복·깜빡임 제거).
export const dynamic = "force-dynamic";

/**
 * /admin/trading — owner 전용 자동매매 설정.
 *
 * 예전엔 마이페이지 설정(/dashboard/settings) 안의 한 섹션이었다. owner 전용 설정이
 * 일반 사용자용 개인 설정 페이지에 얹혀 있었고, 모니터링을 보다가 파라미터를 고치려면
 * 메뉴를 벗어나야 했다. 주식 메뉴 아래로 떼어냈다. (#47)
 * 모니터링도 /dashboard/trading 에서 이 아래(/admin/trading/monitor)로 합쳤다. (#53)
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

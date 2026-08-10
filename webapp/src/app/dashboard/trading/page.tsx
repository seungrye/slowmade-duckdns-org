import { redirect } from "next/navigation";

/**
 * 옛 경로 — 자동매매 모니터링은 /admin/trading/monitor 로 이전했다. (#53)
 *
 * 설정(/admin/trading)과 트리가 갈려 있던 것을 합치면서 옮겼다. 북마크·기존 링크가
 * 깨지지 않도록 리다이렉트만 남긴다. 권한 검사는 이전 대상 페이지가 한다.
 */
export default function LegacyTradingMonitorRedirect() {
    redirect("/admin/trading/monitor");
}

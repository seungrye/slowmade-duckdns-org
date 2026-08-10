import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import TradingMonitorClient from "./monitor-client";

/**
 * /admin/trading/monitor — 자동매매 모니터링(실행 이력·주문 로그). owner 전용.
 *
 * 설정은 상위 경로(/admin/trading). 예전엔 /dashboard/trading 에 있어 설정과 트리가
 * 갈렸는데, 둘 다 owner 전용 자동매매 화면이라 주식 메뉴 아래로 합쳤다. 옛 경로는
 * redirect 로 남겨 북마크를 살린다. (#53)
 */
export default async function TradingMonitorPage() {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) notFound();
  return <TradingMonitorClient />;
}

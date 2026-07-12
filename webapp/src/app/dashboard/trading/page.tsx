import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import TradingMonitorClient from "./monitor-client";

/** 자동매매 모니터링(실행 이력·주문 로그) — owner 전용. 설정은 마이페이지>설정의 접이식 섹션. */
export default async function TradingMonitorPage() {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) notFound();
  return <TradingMonitorClient />;
}

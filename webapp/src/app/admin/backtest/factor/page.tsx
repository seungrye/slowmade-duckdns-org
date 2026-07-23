import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import FactorClient from "./factor-client";

export const dynamic = "force-dynamic";

/**
 * /admin/backtest/factor — 크로스섹셔널 팩터 백테스트 비교(저변동성·모멘텀·평균회귀).
 * 유니버스 다종목 연산은 서버 라우트(/api/admin/backtest/factor)가 Mongo 에서 직접 로드·계산한다.
 */
export default async function FactorBacktestPage() {
  const guard = await requireOwner();
  if (guard instanceof NextResponse) notFound();
  return <FactorClient />;
}

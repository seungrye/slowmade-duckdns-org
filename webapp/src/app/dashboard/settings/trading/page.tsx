import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/require-owner";
import TradingSettingsClient from "./trading-client";

/** 마이페이지>설정>자동매매 — owner 전용(비소유자에겐 존재 자체 미노출). */
export default async function TradingSettingsPage() {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) notFound();
  return <TradingSettingsClient />;
}

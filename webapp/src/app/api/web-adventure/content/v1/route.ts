// /api/web-adventure/content/v1 — Web MUD 클라이언트 전용 통합 컨텐츠 엔드포인트.
//
// 모든 씬을 한 번에 반환하여 라이트한 CDN 캐시 (max-age=60) 로 서비스한다.
// 버전 prefix (v1) 는 컨텐츠 형식 호환 단절 시 v2 로 갈 수 있도록 준비.

import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import WebAdventureScene from "@/models/web-adventure-scene";

export async function GET() {
  await connectToDB();
  const scenes = await WebAdventureScene.find({}).lean();
  return NextResponse.json(
    { success: true, data: { scenes } },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}

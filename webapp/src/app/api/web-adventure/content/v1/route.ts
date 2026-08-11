// /api/web-adventure/content/v1 — Web MUD 클라이언트 전용 통합 컨텐츠 엔드포인트.
//
// 모든 씬을 한 번에 반환하여 라이트한 CDN 캐시 (max-age=60) 로 서비스한다.
// 버전 prefix (v1) 는 컨텐츠 형식 호환 단절 시 v2 로 갈 수 있도록 준비.

import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import WebAdventureScene from "@/models/web-adventure-scene";
import { DEFAULT_VOICE, resolveBody, voiceCoverage } from "@/lib/web-adventure/voice";

// 공개 read-only 컨텐츠 — 앱(Capacitor WebView, cross-origin)도 소비하므로 CORS 허용.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

type SceneDoc = Record<string, unknown> & {
  body: string[];
  treatment?: string[];
  variants?: Record<string, string[]>;
};

/**
 * @param req ?voice= 로 문체를 고른다. 없으면 기본 문체.
 *   랜덤 선택은 **클라이언트 몫**이다 — 서버가 매번 랜덤을 돌리면 응답을 캐시할 수 없다.
 *   클라이언트는 함께 내려주는 voices(완비율)를 보고 고른 뒤 그 값으로 다시 요청한다. (#73)
 */
export async function GET(req: Request) {
  await connectToDB();
  const docs = (await WebAdventureScene.find({ isDeleted: { $ne: true } }).lean()) as SceneDoc[];

  const requested = req?.url ? new URL(req.url).searchParams.get("voice") : null;
  const voice = requested || DEFAULT_VOICE;

  // treatment(뼈대)·variants 는 클라이언트로 내보내지 않는다 — 노출 금지 + 페이로드 절감.
  const scenes = docs.map((doc) => {
    const { treatment: _t, variants: _v, ...rest } = doc;
    void _t; void _v;
    return { ...rest, body: resolveBody(doc, voice) };
  });

  return NextResponse.json(
    { success: true, data: { scenes, voice, voices: voiceCoverage(docs) } },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
        ...CORS_HEADERS,
      },
    },
  );
}

// CORS preflight — 앱 WebView 의 cross-origin fetch 대비.
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

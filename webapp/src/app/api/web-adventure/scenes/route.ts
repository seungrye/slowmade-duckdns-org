// /api/web-adventure/scenes — 씬 목록 + 생성.
//
// Phase B 기준 (사용자 결정): admin 권한 없이 전체 공개.
// Phase F (사이트 노출 + 정식 admin UI) 시점에 권한 강제 예정.

import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import WebAdventureScene from "@/models/web-adventure-scene";

export async function GET() {
  await connectToDB();
  const scenes = await WebAdventureScene.find({})
    .sort({ id: 1 })
    .lean();
  return apiSuccess(scenes);
}

export async function POST(req: NextRequest) {
  await connectToDB();
  const body = await req.json();

  // 필수 필드 검증
  if (!body.id || !body.title || !body.illustration || !Array.isArray(body.body)) {
    return apiError("id, title, illustration, body 는 필수입니다.", 400);
  }

  const existing = await WebAdventureScene.findOne({ id: body.id });
  if (existing) return apiError(`이미 존재하는 씬 ID 입니다: ${body.id}`, 409);

  try {
    const scene = await WebAdventureScene.create({
      id: body.id,
      title: body.title,
      illustration: body.illustration,
      body: body.body,
      choices: body.choices ?? [],
      onEnter: body.onEnter,
      isEnding: body.isEnding,
      endingId: body.endingId,
    });
    return apiSuccess(scene, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "씬 생성 실패";
    return apiError(message, 400);
  }
}

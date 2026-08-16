// /api/web-adventure/scenes/[id]/revisions/[version] — 단일 GET (snapshot 포함).
// 미리보기 / 복원 후보 데이터 fetch 용.

import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import WebAdventureSceneRevision from "@/models/web-adventure-scene-revision";
import { requireOwner } from "@/lib/require-owner";

type Params = { params: Promise<{ id: string; version: string }> };

// 스냅샷은 씬 전문이다 — 작성자만 (#177). 인가를 가장 먼저 둔다.
export async function GET(_req: NextRequest, { params }: Params) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const { id, version } = await params;
  const v = Number(version);
  // version 은 0-based (snapshot 시점 의 revisionCount). 음수만 거부.
  if (!Number.isFinite(v) || v < 0) {
    return apiError(`version 이 올바르지 않습니다: ${version}`, 400);
  }
  await connectToDB();
  const rev = await WebAdventureSceneRevision.findOne({
    sceneId: id,
    version: v,
  }).lean();
  if (!rev) return apiError(`리비전을 찾을 수 없습니다: ${id} v${v}`, 404);
  return apiSuccess(rev);
}

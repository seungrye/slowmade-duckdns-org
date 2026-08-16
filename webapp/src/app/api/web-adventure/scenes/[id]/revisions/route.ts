// /api/web-adventure/scenes/[id]/revisions — 목록 GET.
//
// version DESC 정렬, snapshot 제외 (가벼움).

import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess } from "@/lib/api-response";
import WebAdventureSceneRevision from "@/models/web-adventure-scene-revision";
import { requireOwner } from "@/lib/require-owner";

type Params = { params: Promise<{ id: string }> };

// 리비전은 **작성 도구의 메타데이터**다 — 작성자만 본다 (#177).
// 인가를 DB 조회보다 먼저 둔다: 없는 씬과 남의 씬이 같은 404 여야 존재 여부가 새지 않는다.
export async function GET(_req: NextRequest, { params }: Params) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  await connectToDB();
  const { id } = await params;
  const list = await WebAdventureSceneRevision.find({ sceneId: id })
    .sort({ version: -1 })
    .select("_id version createdAt author")
    .lean();
  return apiSuccess(list);
}

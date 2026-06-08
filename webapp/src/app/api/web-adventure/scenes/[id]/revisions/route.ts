// /api/web-adventure/scenes/[id]/revisions — 목록 GET.
//
// version DESC 정렬, snapshot 제외 (가벼움).

import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess } from "@/lib/api-response";
import WebAdventureSceneRevision from "@/models/web-adventure-scene-revision";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const list = await WebAdventureSceneRevision.find({ sceneId: id })
    .sort({ version: -1 })
    .select("_id version createdAt author")
    .lean();
  return apiSuccess(list);
}

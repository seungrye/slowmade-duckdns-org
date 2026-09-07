// /api/web-adventure/scenes/[id]/revisions/[version] - a single GET (the snapshot included).
// For fetching preview and restore-candidate data.

import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import WebAdventureSceneRevision from "@/models/web-adventure-scene-revision";
import { requireOwner } from "@/lib/require-owner";

type Params = { params: Promise<{ id: string; version: string }> };

// A snapshot is the scene's full text - the author's alone (#177). Authorisation comes first.
export async function GET(_req: NextRequest, { params }: Params) {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) return owner;
  const { id, version } = await params;
  const v = Number(version);
  // version is 0-based (the revisionCount at the snapshot). Only a negative is rejected.
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

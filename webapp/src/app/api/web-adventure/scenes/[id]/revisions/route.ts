// /api/web-adventure/scenes/[id]/revisions - the list GET.
//
// Sorted by version descending, with the snapshot excluded (keeping it light).

import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess } from "@/lib/api-response";
import WebAdventureSceneRevision from "@/models/web-adventure-scene-revision";
import { requireOwner } from "@/lib/require-owner";

type Params = { params: Promise<{ id: string }> };

// A revision is **the authoring tool's metadata** - the author alone sees it (#177).
// Authorisation comes before the DB query: a missing scene and someone else's must give the same 404 so existence does not leak.
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

// /api/web-adventure/scenes/[id]/restore — POST { version }.
//
// What it does:
//   - *overwrites the current scene* with that version's snapshot (findOneAndUpdate).
//   - automatically backs up the *current* state as a new revision just before overwriting (the same pattern as PUT).
//
// It repeats the same flow rather than calling PUT's logic directly - the body is the snapshot itself, so it is
// handled explicitly to keep metadata such as the id from mixing in.

import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { requireOwner } from "@/lib/require-owner";
import { apiSuccess, apiError } from "@/lib/api-response";
import WebAdventureScene from "@/models/web-adventure-scene";
import WebAdventureSceneRevision from "@/models/web-adventure-scene-revision";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const authed = await requireOwner(); // Restoring a revision is the author's alone (#179)
  if (authed instanceof NextResponse) return authed;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { version?: number };
  const version = Number(body.version);
  // version is 0-based (the revisionCount at the snapshot). Only a negative is rejected.
  if (!Number.isFinite(version) || version < 0) {
    return apiError("version 이 필요합니다.", 400);
  }

  await connectToDB();

  // 1. Fetch the revision to restore.
  const target = await WebAdventureSceneRevision.findOne({
    sceneId: id,
    version,
  }).lean();
  if (!target) return apiError(`리비전을 찾을 수 없습니다: ${id} v${version}`, 404);

  // 2. Overwrite the current scene with the snapshot.
  //    The snapshot's mongo metadata keys are stripped (the id is kept from the URL path).
  const snapshot = (target as { snapshot: Record<string, unknown> }).snapshot ?? {};
  const update: Record<string, unknown> = { ...snapshot };
  delete update.id;
  delete update._id;
  delete update.createdAt;
  delete update.updatedAt;
  delete update.__v;

  // 3. Update from the snapshot and $inc revisionCount by 1 (a restore is a new commit too).
  //    Restoring a soft-deleted scene revives it (clearing isDeleted - guaranteed even when an old snapshot lacks the field).
  const restored = await WebAdventureScene.findOneAndUpdate(
    { id },
    { $set: { ...update, isDeleted: false, deletedAt: null }, $inc: { revisionCount: 1 } },
    { new: true, runValidators: true },
  ).lean();
  if (!restored) return apiError(`씬을 찾을 수 없습니다: ${id}`, 404);

  // 4. Create the new commit's revision - snapshot = restored, version = restored.revCount.
  //    The old current is *already backed up as the previous commit (v_{current.revCount})*.
  const restoredVersion =
    (restored as { revisionCount?: number }).revisionCount ?? 0;
  await WebAdventureSceneRevision.create({
    sceneId: id,
    snapshot: restored,
    version: restoredVersion,
    author: "system",
    createdAt: new Date(),
  });

  return apiSuccess(restored);
}

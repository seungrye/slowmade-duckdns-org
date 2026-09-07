// /api/web-adventure/scenes/[id] - a single scene's GET, PUT and DELETE.
//
// id is the business id (scene.id), not the mongo _id.
//
// #revision - every commit (both inserts and PUTs) is backed up as a revision (git-like).
//   - every mongo state change -> one revision.
//   - the snapshot is the mongo state *after* that commit (= updated).
//   - version = updated.revisionCount.
//     e.g. a seed or insert -> revision { v: 0, snapshot: state A }
//          the 1st PUT (changing to B) -> revision { v: 1, snapshot: state B }
//          the 2nd PUT (changing to C) -> revision { v: 2, snapshot: state C }
//   - UI: v0 is "the first draft" (no diff). v_N (N >= 1) is the v_{N-1} -> v_N diff.
//   - 'restore to v_N' = mongo becomes the v_N snapshot plus a new commit (v_{last+1}).

import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { requireOwner } from "@/lib/require-owner";
import { apiSuccess, apiError } from "@/lib/api-response";
import WebAdventureScene from "@/models/web-adventure-scene";
import WebAdventureSceneRevision from "@/models/web-adventure-scene-revision";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  // A deleted scene is treated as absent (#177). The same condition as the list and `content/v1` -
  // only this was missing, so a deleted scene stayed readable to anyone who knew its id (every deletion is a soft delete).
  const scene = await WebAdventureScene.findOne({ id, isDeleted: { $ne: true } }).lean();
  if (!scene) return apiError(`씬을 찾을 수 없습니다: ${id}`, 404);
  return apiSuccess(scene);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const authed = await requireOwner(); // Editing a scene is the author's alone (#179)
  if (authed instanceof NextResponse) return authed;
  await connectToDB();
  const { id } = await params;
  const body = await req.json();

  // 1. A snapshot of the *existing scene* in mongo (the state before overwriting).
  const existing = await WebAdventureScene.findOne({ id }).lean();

  // 2. The id comes from the URL path - the body's id is ignored (or forced to match).
  const update = { ...body };
  delete update.id;
  // revisionCount is managed by the server through $inc - client input is ignored.
  delete update.revisionCount;

  // A commit changing *only* the graph card's position (x, y) is not versioned - it stops a revision
  // piling up with every node drag (a layout change, not a content one).
  // If even one content field changes with it, a revision and revisionCount++ happen as before.
  const changedKeys = Object.keys(update);
  const positionOnly =
    changedKeys.length > 0 && changedKeys.every((k) => k === "position");

  // The old quest CMS pattern - revisionCount is $inc'd by 1 only when the scene already exists.
  // On the first creation (existing=null) it is $set alone (keeping revisionCount's default of 0).
  const updateQuery: Record<string, unknown> = { $set: update };
  if (existing && !positionOnly) {
    updateQuery.$inc = { revisionCount: 1 };
  }

  const updated = await WebAdventureScene.findOneAndUpdate(
    { id },
    updateQuery,
    { new: true, runValidators: true },
  ).lean();

  if (!updated) return apiError(`씬을 찾을 수 없습니다: ${id}`, 404);

  // 3. A revision is created only for a content commit (a position-only commit is skipped). The first creation is backed up as v0 too.
  //    snapshot = updated (the state after that commit). version = updated.revisionCount.
  if (!positionOnly) {
    const commitVersion =
      (updated as { revisionCount?: number }).revisionCount ?? 0;
    await WebAdventureSceneRevision.create({
      sceneId: id,
      snapshot: updated,
      version: commitVersion,
      author: "system",
      createdAt: new Date(),
    });
  }

  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const authed = await requireOwner(); // Deleting a scene is the author's alone (#179)
  if (authed instanceof NextResponse) return authed;
  await connectToDB();
  const { id } = await params;
  // A soft delete rather than a hard one - the document and its revision history are preserved and hidden by isDeleted.
  // Creating the same id again (POST) reuses (undeletes) this document.
  const deleted = await WebAdventureScene.findOneAndUpdate(
    { id, isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  );
  if (!deleted) return apiError(`씬을 찾을 수 없습니다: ${id}`, 404);
  return apiSuccess({ id });
}

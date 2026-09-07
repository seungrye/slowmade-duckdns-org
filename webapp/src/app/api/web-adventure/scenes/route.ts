// /api/web-adventure/scenes - the scene list plus creation.
//
// As of Phase B (the user's decision): fully public, with no admin permission.
// Permissions are to be enforced at Phase F (site exposure plus a proper admin UI).

import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { requireOwner } from "@/lib/require-owner";
import { apiSuccess, apiError } from "@/lib/api-response";
import WebAdventureScene from "@/models/web-adventure-scene";

export async function GET() {
  await connectToDB();
  const scenes = await WebAdventureScene.find({ isDeleted: { $ne: true } })
    .sort({ id: 1 })
    .lean();
  return apiSuccess(scenes);
}

export async function POST(req: NextRequest) {
  const authed = await requireOwner(); // Creating a scene is the author's alone (#179)
  if (authed instanceof NextResponse) return authed;
  await connectToDB();
  const body = await req.json();

  // Validating the required fields
  if (!body.id || !body.title || !body.illustration || !Array.isArray(body.body)) {
    return apiError("id, title, illustration, body 는 필수입니다.", 400);
  }

  // id is unique - a live one gives 409, and a soft-deleted document is reused (undeleted and overwritten with the new content).
  const existing = await WebAdventureScene.findOne({ id: body.id });
  if (existing && !existing.isDeleted) {
    return apiError(`이미 존재하는 씬 ID 입니다: ${body.id}`, 409);
  }

  try {
    if (existing) {
      // Reusing a soft-deleted scene - overwritten with the new content and undeleted. The variation images are
      // cleared so none of the old ones remain (recreating means starting clean). position is kept, being a graph coordinate.
      existing.set({
        title: body.title, illustration: body.illustration, body: body.body,
        choices: body.choices ?? [], onEnter: body.onEnter,
        isEnding: body.isEnding, endingId: body.endingId,
        illustrations: Array.isArray(body.illustrations) ? body.illustrations : [],
        isDeleted: false, deletedAt: null,
      });
      await existing.save();
      return apiSuccess(existing, 201);
    }
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

// /api/web-adventure/scenes/[id] — 단일 씬 GET / PUT / DELETE.
//
// id 는 비즈니스 id (scene.id) — mongo _id 가 아니다.

import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import WebAdventureScene from "@/models/web-adventure-scene";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const scene = await WebAdventureScene.findOne({ id }).lean();
  if (!scene) return apiError(`씬을 찾을 수 없습니다: ${id}`, 404);
  return apiSuccess(scene);
}

export async function PUT(req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const body = await req.json();

  // id 는 URL 경로 기준 — body 의 id 는 무시 (또는 동일성 강제).
  const update = { ...body };
  delete update.id;

  const updated = await WebAdventureScene.findOneAndUpdate(
    { id },
    { $set: update },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) return apiError(`씬을 찾을 수 없습니다: ${id}`, 404);
  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const deleted = await WebAdventureScene.findOneAndDelete({ id });
  if (!deleted) return apiError(`씬을 찾을 수 없습니다: ${id}`, 404);
  return apiSuccess({ id });
}

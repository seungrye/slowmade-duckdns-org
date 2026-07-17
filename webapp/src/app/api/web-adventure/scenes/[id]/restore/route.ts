// /api/web-adventure/scenes/[id]/restore — POST { version }.
//
// 동작:
//   - 그 version 의 snapshot 으로 *현재 씬 덮어쓰기* (findOneAndUpdate).
//   - 덮어쓰기 직전 *현재* 상태를 새 revision 으로 자동 백업 (PUT 패턴 동일).
//
// PUT 의 로직을 직접 호출하지 않고 동일 흐름을 반복 — body 가 snapshot 자체이므로
// id 등 metadata 가 섞이지 않도록 명시적으로 처리.

import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import WebAdventureScene from "@/models/web-adventure-scene";
import WebAdventureSceneRevision from "@/models/web-adventure-scene-revision";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { version?: number };
  const version = Number(body.version);
  // version 은 0-based (snapshot 시점의 revisionCount). 음수만 거부.
  if (!Number.isFinite(version) || version < 0) {
    return apiError("version 이 필요합니다.", 400);
  }

  await connectToDB();

  // 1. 복원 대상 revision fetch.
  const target = await WebAdventureSceneRevision.findOne({
    sceneId: id,
    version,
  }).lean();
  if (!target) return apiError(`리비전을 찾을 수 없습니다: ${id} v${version}`, 404);

  // 2. snapshot 으로 현재 씬 덮어쓰기.
  //    snapshot 의 mongo metadata 키는 제거 (id 는 URL 경로 기준 보존).
  const snapshot = (target as { snapshot: Record<string, unknown> }).snapshot ?? {};
  const update: Record<string, unknown> = { ...snapshot };
  delete update.id;
  delete update._id;
  delete update.createdAt;
  delete update.updatedAt;
  delete update.__v;

  // 3. snapshot 으로 update + revisionCount $inc 1 (복원도 새 commit).
  //    소프트 삭제된 씬을 복원하면 되살린다(isDeleted 해제 — 옛 스냅샷에 필드가 없어도 보장).
  const restored = await WebAdventureScene.findOneAndUpdate(
    { id },
    { $set: { ...update, isDeleted: false, deletedAt: null }, $inc: { revisionCount: 1 } },
    { new: true, runValidators: true },
  ).lean();
  if (!restored) return apiError(`씬을 찾을 수 없습니다: ${id}`, 404);

  // 4. 새 commit 의 revision 생성 — snapshot = restored, version = restored.revCount.
  //    옛 current 는 *이미 이전 commit (v_{current.revCount})* 으로 백업되어 있음.
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

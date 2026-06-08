// /api/web-adventure/scenes/[id] — 단일 씬 GET / PUT / DELETE.
//
// id 는 비즈니스 id (scene.id) — mongo _id 가 아니다.
//
// #revision — 모든 commit (insert/PUT 모두) 을 revision 으로 백업 (git-like).
//   - 매 mongo state change → revision 1 개.
//   - snapshot = *그 commit 후* mongo 상태 (= updated).
//   - version = updated.revisionCount.
//     예) 시드/insert 시 → revision { v: 0, snapshot: state A }
//         1차 PUT (B 로 변경) → revision { v: 1, snapshot: state B }
//         2차 PUT (C 로 변경) → revision { v: 2, snapshot: state C }
//   - UI: v0 = "최초 작성" (diff 없음). v_N (N>=1) = v_{N-1} → v_N diff.
//   - 'v_N 으로 복원' = mongo = v_N snapshot + 새 commit (v_{last+1}).

import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import WebAdventureScene from "@/models/web-adventure-scene";
import WebAdventureSceneRevision from "@/models/web-adventure-scene-revision";

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

  // 1. 현재 mongo 의 *기존 씬* snapshot (덮어쓰기 전 상태).
  const existing = await WebAdventureScene.findOne({ id }).lean();

  // 2. id 는 URL 경로 기준 — body 의 id 는 무시 (또는 동일성 강제).
  const update = { ...body };
  delete update.id;
  // revisionCount 는 서버가 $inc 로 관리 — 클라이언트 입력 무시.
  delete update.revisionCount;

  // 옛 quest CMS 패턴 — 기존 씬이 있을 때만 revisionCount 를 $inc 1.
  // 첫 생성 (existing=null) 분기에서는 $set 만 (revisionCount default 0 유지).
  const updateQuery: Record<string, unknown> = { $set: update };
  if (existing) {
    updateQuery.$inc = { revisionCount: 1 };
  }

  const updated = await WebAdventureScene.findOneAndUpdate(
    { id },
    updateQuery,
    { new: true, runValidators: true },
  ).lean();

  if (!updated) return apiError(`씬을 찾을 수 없습니다: ${id}`, 404);

  // 3. 모든 commit (insert/update) 시 revision 생성. 첫 생성도 v0 백업.
  //    snapshot = updated (= 그 commit 후 상태). version = updated.revisionCount.
  const commitVersion =
    (updated as { revisionCount?: number }).revisionCount ?? 0;
  await WebAdventureSceneRevision.create({
    sceneId: id,
    snapshot: updated,
    version: commitVersion,
    author: "system",
    createdAt: new Date(),
  });

  return apiSuccess(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const deleted = await WebAdventureScene.findOneAndDelete({ id });
  if (!deleted) return apiError(`씬을 찾을 수 없습니다: ${id}`, 404);
  return apiSuccess({ id });
}

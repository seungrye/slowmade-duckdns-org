import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Quest from "@/models/quest";

// POST /api/quests/bulk-update-spawn-chance  body: { ids: string[], spawnChance: number }
//
// 여러 퀘스트의 spawnChance 를 한 번에 같은 값으로 갱신한다. ids 는 Quest 문서의
// MongoDB _id 문자열. spawnChance 는 0.0~1.0 범위.
export async function POST(req: NextRequest) {
  await connectToDB();
  const body = await req.json().catch(() => null) as {
    ids?: unknown;
    spawnChance?: unknown;
  } | null;
  const ids = body?.ids;
  const sc = body?.spawnChance;

  if (!Array.isArray(ids) || ids.length === 0) {
    return apiError("대상 id 목록(ids)이 필요합니다.", 400);
  }
  if (typeof sc !== "number" || !Number.isFinite(sc) || sc < 0 || sc > 1) {
    return apiError("spawnChance 는 0.0~1.0 사이의 숫자여야 합니다.", 400);
  }

  // version 도 증가시켜 클라이언트가 변경을 감지 가능하게.
  const result = await Quest.updateMany(
    { _id: { $in: ids } },
    { $set: { spawnChance: sc }, $inc: { version: 1 } },
  );
  return apiSuccess({ updated: result.modifiedCount ?? 0 });
}

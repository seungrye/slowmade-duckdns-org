import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Monster from "@/models/monster";
import MonsterRevision from "@/models/monster-revision";

// POST /api/quests/monsters/bulk-delete  body: { ids: string[] }
//
// 여러 monster 를 한 번에 삭제. cascade 로 revision 도 함께.
export async function POST(req: NextRequest) {
  await connectToDB();
  const body = await req.json().catch(() => null);
  const ids = (body as { ids?: unknown } | null)?.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return apiError("삭제할 monster id 목록(ids)이 필요합니다.", 400);
  }

  const monsters = await Monster.find({ id: { $in: ids } }, { _id: 1 }).lean();
  const objectIds = monsters.map((m) => m._id);
  if (objectIds.length > 0) {
    await MonsterRevision.deleteMany({ monsterId: { $in: objectIds } });
  }

  const result = await Monster.deleteMany({ id: { $in: ids } });
  return apiSuccess({ deleted: result.deletedCount ?? 0 });
}

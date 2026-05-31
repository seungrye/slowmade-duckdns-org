import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Quest from "@/models/quest";
import QuestRevision from "@/models/quest-revision";

// POST /api/quests/bulk-delete  body: { ids: string[] }   (ids 는 Quest doc 의 _id 문자열)
//
// cascade: 해당 quest 의 revision 도 함께 삭제.
export async function POST(req: NextRequest) {
  await connectToDB();
  const body = await req.json().catch(() => null);
  const ids = (body as { ids?: unknown } | null)?.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return apiError("삭제할 quest id(_id) 목록(ids)이 필요합니다.", 400);
  }

  await QuestRevision.deleteMany({ questId: { $in: ids } });
  const result = await Quest.deleteMany({ _id: { $in: ids } });
  return apiSuccess({ deleted: result.deletedCount ?? 0 });
}

import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Villager from "@/models/villager";
import VillagerRevision from "@/models/villager-revision";

// POST /api/quests/villagers/bulk-delete  body: { ids: string[] }
//
// cascade: revision 도 함께.
export async function POST(req: NextRequest) {
  await connectToDB();
  const body = await req.json().catch(() => null);
  const ids = (body as { ids?: unknown } | null)?.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return apiError("삭제할 villager id 목록(ids)이 필요합니다.", 400);
  }

  const villagers = await Villager.find({ id: { $in: ids } }, { _id: 1 }).lean();
  const objectIds = villagers.map((v) => v._id);
  if (objectIds.length > 0) {
    await VillagerRevision.deleteMany({ villagerId: { $in: objectIds } });
  }
  const result = await Villager.deleteMany({ id: { $in: ids } });
  return apiSuccess({ deleted: result.deletedCount ?? 0 });
}

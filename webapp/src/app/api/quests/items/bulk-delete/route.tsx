import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Item from "@/models/item";
import ItemRevision from "@/models/item-revision";

// POST /api/quests/items/bulk-delete  body: { ids: string[] }
export async function POST(req: NextRequest) {
  await connectToDB();
  const body = await req.json().catch(() => null);
  const ids = (body as { ids?: unknown } | null)?.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return apiError("삭제할 item id 목록(ids)이 필요합니다.", 400);
  }

  // cascade: 대상 item 들의 revision 먼저 삭제
  const items = await Item.find({ id: { $in: ids } }, { _id: 1 }).lean();
  const objectIds = items.map((it) => it._id);
  if (objectIds.length > 0) {
    await ItemRevision.deleteMany({ itemId: { $in: objectIds } });
  }

  const result = await Item.deleteMany({ id: { $in: ids } });
  return apiSuccess({ deleted: result.deletedCount ?? 0 });
}

import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Zone from "@/models/zone";
import ZoneRevision from "@/models/zone-revision";

// POST /api/quests/zones/bulk-delete  body: { names: string[] }
//
// 여러 zone 을 한 번에 삭제. 식별자는 name (Zone.findOne({ name }) 패턴과 동일).
// cascade: 해당 zone 의 revision 도 함께 삭제.
export async function POST(req: NextRequest) {
  await connectToDB();
  const body = await req.json().catch(() => null);
  const names = (body as { names?: unknown } | null)?.names;

  if (!Array.isArray(names) || names.length === 0) {
    return apiError("삭제할 zone name 목록(names)이 필요합니다.", 400);
  }

  const zones = await Zone.find({ name: { $in: names } }, { _id: 1 }).lean();
  const objectIds = zones.map((z) => z._id);
  if (objectIds.length > 0) {
    await ZoneRevision.deleteMany({ zoneId: { $in: objectIds } });
  }

  const result = await Zone.deleteMany({ name: { $in: names } });
  return apiSuccess({ deleted: result.deletedCount ?? 0 });
}

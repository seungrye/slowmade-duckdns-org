import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Zone from "@/models/zone";
import ZoneRevision from "@/models/zone-revision";

type Params = { params: Promise<{ name: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { name } = await params;
  const decoded = decodeURIComponent(name);

  const zone = await Zone.findOne({ name: decoded }).select("_id").lean();
  if (!zone) return apiError("zone 을 찾을 수 없습니다.", 404);

  const revisions = await ZoneRevision.find({ zoneId: zone._id })
    .sort({ version: -1 })
    .lean();

  return apiSuccess(revisions);
}

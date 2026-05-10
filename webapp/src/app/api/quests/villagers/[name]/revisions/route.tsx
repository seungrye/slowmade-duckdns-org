import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Villager from "@/models/villager";
import VillagerRevision from "@/models/villager-revision";

type Params = { params: Promise<{ name: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { name } = await params;
  const decoded = decodeURIComponent(name);

  const villager = await Villager.findOne({ name: decoded }).select("_id").lean();
  if (!villager) return apiError("villager 를 찾을 수 없습니다.", 404);

  const revisions = await VillagerRevision.find({ villagerId: villager._id })
    .sort({ version: -1 })
    .lean();

  return apiSuccess(revisions);
}

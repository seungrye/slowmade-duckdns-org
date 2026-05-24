import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Monster from "@/models/monster";
import MonsterRevision from "@/models/monster-revision";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const decoded = decodeURIComponent(id);

  const monster = await Monster.findOne({ id: decoded }).select("_id").lean();
  if (!monster) return apiError("monster 를 찾을 수 없습니다.", 404);

  const revisions = await MonsterRevision.find({ monsterId: monster._id })
    .sort({ version: -1 })
    .lean();

  return apiSuccess(revisions);
}

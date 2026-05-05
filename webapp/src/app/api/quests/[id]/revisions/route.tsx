import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Quest from "@/models/quest";
import QuestRevision from "@/models/quest-revision";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;

  const quest = await Quest.findById(id).select("_id").lean();
  if (!quest) return apiError("퀘스트를 찾을 수 없습니다.", 404);

  const revisions = await QuestRevision.find({ questId: quest._id })
    .sort({ version: -1 })
    .lean();

  return apiSuccess(revisions);
}

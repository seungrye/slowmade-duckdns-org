import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Quest from "@/models/quest";
import QuestRevision from "@/models/quest-revision";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const quest = await Quest.findById(id).lean();
  if (!quest) return apiError("퀘스트를 찾을 수 없습니다.", 404);
  return apiSuccess(quest);
}

export async function PUT(req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const body = await req.json();

  const quest = await Quest.findById(id);
  if (!quest) return apiError("퀘스트를 찾을 수 없습니다.", 404);

  // 현재 버전을 revision으로 저장
  await QuestRevision.create({
    questId: quest._id,
    version: quest.version,
    quest: {
      id: quest.id,
      title: quest.title,
      giverNpc: quest.giverNpc,
      initialPhase: quest.initialPhase,
      phases: Object.fromEntries(quest.phases ?? new Map()),
      spawns: quest.spawns,
    },
  });

  quest.title = body.title ?? quest.title;
  quest.giverNpc = body.giverNpc ?? quest.giverNpc;
  quest.initialPhase = body.initialPhase ?? quest.initialPhase;
  quest.phases = body.phases ?? quest.phases;
  quest.spawns = body.spawns ?? quest.spawns;
  quest.version = (quest.version ?? 1) + 1;

  await quest.save();
  return apiSuccess(quest);
}

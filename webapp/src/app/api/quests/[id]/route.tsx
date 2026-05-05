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
  // lean() returns plain objects; Map instances come from non-lean documents
  const rawPhases = quest.phases as unknown;
  const data = {
    ...quest,
    phases: rawPhases instanceof Map
      ? Object.fromEntries(rawPhases)
      : (rawPhases as Record<string, unknown>) ?? {},
  };
  return apiSuccess(data);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const quest = await Quest.findById(id);
  if (!quest) return apiError("퀘스트를 찾을 수 없습니다.", 404);
  await QuestRevision.deleteMany({ questId: quest._id });
  await quest.deleteOne();
  return apiSuccess({ id });
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

  if (body.title !== undefined) quest.title = body.title;
  if (body.giverNpc !== undefined) quest.giverNpc = body.giverNpc;
  if (body.initialPhase !== undefined) quest.initialPhase = body.initialPhase;
  if (body.spawns !== undefined) quest.spawns = body.spawns;

  // phases는 plain object → Map으로 변환해서 저장
  if (body.phases !== undefined) {
    quest.phases = new Map(Object.entries(body.phases));
  }

  quest.version = (quest.version ?? 1) + 1;
  await quest.save();

  return apiSuccess({
    ...quest.toObject(),
    phases: Object.fromEntries(quest.phases ?? new Map()),
  });
}

import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Quest from "@/models/quest";
import QuestRevision from "@/models/quest-revision";

type Params = { params: Promise<{ id: string; ver: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id, ver } = await params;
  const version = Number(ver);

  const quest = await Quest.findById(id);
  if (!quest) return apiError("퀘스트를 찾을 수 없습니다.", 404);

  const revision = await QuestRevision.findOne({ questId: quest._id, version }).lean<{ quest: Record<string, unknown> }>();
  if (!revision) return apiError(`버전 ${version}을 찾을 수 없습니다.`, 404);

  // 현재 상태를 revision으로 먼저 백업
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

  const def = revision.quest as Record<string, unknown>;
  quest.title = def.title as string;
  quest.giverNpc = def.giverNpc as string;
  quest.initialPhase = def.initialPhase as string;
  quest.phases = new Map(Object.entries((def.phases as Record<string, unknown>) ?? {}));
  quest.spawns = (def.spawns as unknown[]) ?? [];
  quest.version = (quest.version ?? 1) + 1;

  await quest.save();
  return apiSuccess({
    ...quest.toObject(),
    phases: Object.fromEntries(quest.phases ?? new Map()),
  }, 200, `버전 ${version}으로 롤백 완료`);
}

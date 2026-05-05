import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Quest from "@/models/quest";
import QuestRevision from "@/models/quest-revision";
import { parseRon } from "@/lib/ron";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;

  const quest = await Quest.findById(id);
  if (!quest) return apiError("퀘스트를 찾을 수 없습니다.", 404);

  const body = await req.text();
  let def;
  try {
    def = parseRon(body);
  } catch (e) {
    return apiError(`RON 파싱 오류: ${(e as Error).message}`, 400);
  }

  // 현재 버전 revision 백업
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

  quest.title = def.title;
  quest.giverNpc = def.giverNpc;
  quest.initialPhase = def.initialPhase;
  quest.phases = def.phases as never;
  quest.spawns = def.spawns as never;
  quest.version = (quest.version ?? 1) + 1;

  await quest.save();
  return apiSuccess(quest);
}

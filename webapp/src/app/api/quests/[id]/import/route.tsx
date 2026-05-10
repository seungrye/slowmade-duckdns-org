import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiError } from "@/lib/api-response";
import Quest from "@/models/quest";
import QuestRevision from "@/models/quest-revision";
import { parseRon } from "@/lib/ron";
import { validateQuestRefs } from "@/lib/quest-validation";
import { loadCatalogSets } from "@/lib/catalog-sets";
import type { QuestDef } from "@/types/quest";

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
  quest.phases = new Map(Object.entries(def.phases));
  quest.spawns = def.spawns as unknown[];
  quest.version = (quest.version ?? 1) + 1;

  await quest.save();

  // 참조 무결성 검증 (soft warning)
  const catalogs = await loadCatalogSets();
  const phasesObj = Object.fromEntries(quest.phases ?? new Map()) as QuestDef["phases"];
  const warnings = validateQuestRefs(
    {
      id: quest.id,
      title: quest.title,
      giverNpc: quest.giverNpc,
      initialPhase: quest.initialPhase,
      phases: phasesObj,
      spawns: quest.spawns as QuestDef["spawns"],
    },
    catalogs,
  );

  return NextResponse.json({
    success: true,
    data: {
      ...quest.toObject(),
      phases: phasesObj,
    },
    warnings,
  });
}

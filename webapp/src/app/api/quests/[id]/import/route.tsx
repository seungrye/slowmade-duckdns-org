import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiError } from "@/lib/api-response";
import Quest from "@/models/quest";
import QuestRevision from "@/models/quest-revision";
import { parseRon } from "@/lib/ron";
import { validateQuestRefs, validateQuestStructure } from "@/lib/quest-validation";
import { loadCatalogSets } from "@/lib/catalog-sets";
import { upsertNamedZonesFromQuest } from "@/lib/upsert-quest-zones";
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

  const structErrors = validateQuestStructure(def);
  if (structErrors.length > 0) {
    return apiError(`구조 오류로 import 불가:\n${structErrors.map(e => `  ${e.path}: ${e.message}`).join("\n")}`, 400);
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
      transitions: quest.transitions,
      spawns: quest.spawns,
    },
  });

  quest.title = def.title;
  quest.giverNpc = def.giverNpc;
  quest.initialPhase = def.initialPhase;
  // spawnChance 미지정 RON 은 기본 1.0 (게임 default_spawn_chance 미러).
  quest.spawnChance = def.spawnChance ?? 1.0;
  quest.phases = new Map(Object.entries(def.phases));
  quest.transitions = def.transitions as unknown[];
  quest.spawns = def.spawns as unknown[];
  quest.version = (quest.version ?? 1) + 1;

  await quest.save();

  // 참조 무결성 검증 (soft warning)
  const phasesObj = Object.fromEntries(quest.phases ?? new Map()) as QuestDef["phases"];
  const questDefBase: QuestDef = {
    id: quest.id,
    title: quest.title,
    giverNpc: quest.giverNpc,
    initialPhase: quest.initialPhase,
    phases: phasesObj,
    transitions: (quest.transitions ?? []) as QuestDef["transitions"],
    spawns: quest.spawns as QuestDef["spawns"],
  };
  if (typeof quest.spawnChance === "number") questDefBase.spawnChance = quest.spawnChance;

  // 임포트 직전에 quest 안에서 참조되는 Named zone 들을 카탈로그에 자동 upsert
  // — RON 임포트 후 끊어진 zone 참조 경고를 줄이기 위함.
  const autoRegisteredZones = await upsertNamedZonesFromQuest(questDefBase);

  const catalogs = await loadCatalogSets();
  const warnings = validateQuestRefs(questDefBase, catalogs);

  return NextResponse.json({
    success: true,
    data: {
      ...quest.toObject(),
      phases: phasesObj,
    },
    warnings,
    autoRegisteredZones,
  });
}

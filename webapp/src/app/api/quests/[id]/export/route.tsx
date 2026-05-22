import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiError } from "@/lib/api-response";
import Quest from "@/models/quest";
import { serializeRon } from "@/lib/ron";
import { validateQuestStructure } from "@/lib/quest-validation";
import type { QuestDef } from "@/types/quest";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const quest = await Quest.findById(id).lean();
  if (!quest) return apiError("퀘스트를 찾을 수 없습니다.", 404);

  const def: QuestDef = {
    id: quest.id as string,
    title: quest.title,
    giverNpc: quest.giverNpc,
    initialPhase: quest.initialPhase,
    phases: (quest.phases instanceof Map
      ? Object.fromEntries(quest.phases)
      : (quest.phases as unknown as Record<string, unknown>) ?? {}
    ) as QuestDef["phases"],
    spawns: (quest.spawns as QuestDef["spawns"]) ?? [],
  };

  const structErrors = validateQuestStructure(def);
  if (structErrors.length > 0) {
    return apiError(`구조 오류로 export 불가:\n${structErrors.map(e => `  ${e.path}: ${e.message}`).join("\n")}`, 400);
  }

  const ron = serializeRon(def);
  const encodedFilename = encodeURIComponent(`${def.id}.ron`);

  return new NextResponse(ron, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
    },
  });
}

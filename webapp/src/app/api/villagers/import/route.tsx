import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Villager from "@/models/villager";
import { parseVillagersRon } from "@/lib/ron";
import type { VillagerDef } from "@/types/villager";

function isValidColor(c: unknown): c is [number, number, number] {
  return Array.isArray(c)
    && c.length === 3
    && c.every((n) => typeof n === "number" && n >= 0 && n <= 1);
}

export async function POST(req: NextRequest) {
  await connectToDB();
  const body = await req.text();

  let defs: VillagerDef[];
  try {
    defs = parseVillagersRon(body);
  } catch (e) {
    return apiError(`RON 파싱 오류: ${(e as Error).message}`, 400);
  }

  for (const v of defs) {
    if (!isValidColor(v.color)) {
      return apiError(`color 검증 실패: ${v.name}`, 400);
    }
  }

  let created = 0, updated = 0;
  for (const v of defs) {
    const existing = await Villager.findOne({ name: v.name });
    if (existing) {
      existing.color = v.color;
      existing.dialogs = v.dialogs;
      existing.questId = v.questId;
      existing.speed = v.speed;
      await existing.save();
      updated++;
    } else {
      await Villager.create({
        name: v.name,
        color: v.color,
        dialogs: v.dialogs,
        questId: v.questId,
        speed: v.speed,
      });
      created++;
    }
  }

  return apiSuccess({ created, updated });
}

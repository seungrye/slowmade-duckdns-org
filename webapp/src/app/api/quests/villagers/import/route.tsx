import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Villager from "@/models/villager";
import VillagerRevision from "@/models/villager-revision";
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
    if (!v.id || !v.id.trim()) {
      return apiError(`id 누락: ${v.name || "(이름 없음)"}`, 400);
    }
    if (!isValidColor(v.color)) {
      return apiError(`color 검증 실패: ${v.id}`, 400);
    }
  }

  let created = 0, updated = 0;
  for (const v of defs) {
    const existing = await Villager.findOne({ id: v.id });
    if (existing) {
      // 갱신 직전 현재 버전을 revision 으로 백업
      await VillagerRevision.create({
        villagerId: existing._id,
        version: existing.version,
        villager: {
          id: existing.id,
          name: existing.name,
          color: existing.color,
          dialogs: existing.dialogs,
          speed: existing.speed,
          stationary: existing.stationary,
          vendor: existing.vendor,
        },
      });
      existing.name = v.name;
      existing.color = v.color;
      existing.dialogs = v.dialogs;
      existing.speed = v.speed;
      existing.stationary = v.stationary ?? false;
      existing.vendor = v.vendor ?? false;
      existing.version = (existing.version ?? 1) + 1;
      await existing.save();
      updated++;
    } else {
      await Villager.create({
        id: v.id,
        name: v.name,
        color: v.color,
        dialogs: v.dialogs,
        speed: v.speed,
        stationary: v.stationary ?? false,
        vendor: v.vendor ?? false,
      });
      created++;
    }
  }

  return apiSuccess({ created, updated });
}

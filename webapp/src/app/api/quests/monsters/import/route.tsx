import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Monster from "@/models/monster";
import MonsterRevision from "@/models/monster-revision";
import { parseMonstersRon } from "@/lib/ron";
import type { MonsterDef } from "@/types/monster";

function isValidColor(c: unknown): c is [number, number, number] {
  return Array.isArray(c)
    && c.length === 3
    && c.every((n) => typeof n === "number" && n >= 0 && n <= 1);
}

// MonsterDef 한 건을 DB 문서 형태로 변환 (스키마 필드 매핑).
function toDocFields(m: MonsterDef) {
  return {
    id: m.id,
    displayName: m.displayName,
    glyph: m.glyph,
    color: m.color,
    hp: m.hp,
    attack: m.attack,
    defense: m.defense,
    visionRadius: m.visionRadius,
    speed: m.speed,
    element: m.element ?? null,
    spawnWeight: m.spawnWeight,
    zones: m.zones,
    spawnCondition: m.spawnCondition ?? null,
    questOnly: m.questOnly,
  };
}

export async function POST(req: NextRequest) {
  await connectToDB();
  const body = await req.text();

  let defs: MonsterDef[];
  try {
    defs = parseMonstersRon(body);
  } catch (e) {
    return apiError(`RON 파싱 오류: ${(e as Error).message}`, 400);
  }

  for (const m of defs) {
    if (!m.id || !m.id.trim()) {
      return apiError(`id 누락: ${m.displayName || "(이름 없음)"}`, 400);
    }
    if (!isValidColor(m.color)) {
      return apiError(`color 검증 실패: ${m.id}`, 400);
    }
  }

  let created = 0, updated = 0;
  for (const m of defs) {
    const fields = toDocFields(m);
    const existing = await Monster.findOne({ id: m.id });
    if (existing) {
      // 갱신 직전 현재 버전을 revision 으로 백업
      await MonsterRevision.create({
        monsterId: existing._id,
        version: existing.version,
        monster: {
          id: existing.id,
          displayName: existing.displayName,
          glyph: existing.glyph,
          color: existing.color,
          hp: existing.hp,
          attack: existing.attack,
          defense: existing.defense,
          visionRadius: existing.visionRadius,
          speed: existing.speed,
          element: existing.element ?? null,
          spawnWeight: existing.spawnWeight,
          zones: existing.zones,
          spawnCondition: existing.spawnCondition ?? null,
          questOnly: existing.questOnly,
        },
      });
      Object.assign(existing, fields);
      existing.version = (existing.version ?? 1) + 1;
      await existing.save();
      updated++;
    } else {
      await Monster.create(fields);
      created++;
    }
  }

  return apiSuccess({ created, updated });
}

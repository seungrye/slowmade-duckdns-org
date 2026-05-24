import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Monster from "@/models/monster";
import MonsterRevision from "@/models/monster-revision";

type Params = { params: Promise<{ id: string; ver: string }> };

const RESTORABLE_FIELDS = [
  "displayName", "glyph", "color", "hp", "attack", "defense",
  "visionRadius", "speed", "element", "spawnWeight", "zones",
  "spawnCondition", "questOnly",
] as const;

export async function POST(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id, ver } = await params;
  const decoded = decodeURIComponent(id);
  const version = Number(ver);

  const monster = await Monster.findOne({ id: decoded });
  if (!monster) return apiError("monster 를 찾을 수 없습니다.", 404);

  const revision = await MonsterRevision.findOne({ monsterId: monster._id, version })
    .lean<{ monster: Record<string, unknown> }>();
  if (!revision) return apiError(`버전 ${version}을 찾을 수 없습니다.`, 404);

  // 현재 상태를 revision 으로 백업 후 덮어쓰기
  await MonsterRevision.create({
    monsterId: monster._id,
    version: monster.version,
    monster: {
      id: monster.id,
      displayName: monster.displayName,
      glyph: monster.glyph,
      color: monster.color,
      hp: monster.hp,
      attack: monster.attack,
      defense: monster.defense,
      visionRadius: monster.visionRadius,
      speed: monster.speed,
      element: monster.element ?? null,
      spawnWeight: monster.spawnWeight,
      zones: monster.zones,
      spawnCondition: monster.spawnCondition ?? null,
      questOnly: monster.questOnly,
    },
  });

  const def = revision.monster as Record<string, unknown>;
  for (const field of RESTORABLE_FIELDS) {
    if (def[field] !== undefined) {
      (monster as unknown as Record<string, unknown>)[field] = def[field];
    }
  }
  monster.version = (monster.version ?? 1) + 1;

  await monster.save();
  return apiSuccess(monster, 200, `버전 ${version}으로 롤백 완료`);
}

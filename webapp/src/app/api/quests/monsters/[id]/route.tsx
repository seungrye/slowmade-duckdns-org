import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Monster from "@/models/monster";
import MonsterRevision from "@/models/monster-revision";

type Params = { params: Promise<{ id: string }> };

function isValidColor(c: unknown): c is [number, number, number] {
  return Array.isArray(c)
    && c.length === 3
    && c.every((n) => typeof n === "number" && n >= 0 && n <= 1);
}

const VALID_ELEMENTS = ["fire", "ice", "poison", "lightning"];

const EDITABLE_FIELDS = [
  "displayName", "glyph", "color", "hp", "attack", "defense",
  "visionRadius", "speed", "element", "spawnWeight", "zones",
  "spawnCondition", "questOnly",
] as const;

export async function GET(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const monster = await Monster.findOne({ id: decodeURIComponent(id) }).lean();
  if (!monster) return apiError("monster 를 찾을 수 없습니다.", 404);
  return apiSuccess(monster);
}

export async function PUT(req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const body = await req.json();

  const monster = await Monster.findOne({ id: decoded });
  if (!monster) return apiError("monster 를 찾을 수 없습니다.", 404);

  if (body.color !== undefined && !isValidColor(body.color)) {
    return apiError("color 는 [r, g, b] (각 0.0~1.0) 형식이어야 합니다.", 400);
  }
  if (body.element != null && body.element !== undefined && !VALID_ELEMENTS.includes(body.element)) {
    return apiError(`element 는 ${VALID_ELEMENTS.join("/")} 또는 null 이어야 합니다.`, 400);
  }

  // 갱신 직전 현재 버전을 revision 으로 백업
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

  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      // mongoose Document 의 동적 필드 할당
      (monster as unknown as Record<string, unknown>)[field] = body[field];
    }
  }
  monster.version = (monster.version ?? 1) + 1;

  await monster.save();
  return apiSuccess(monster);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const monster = await Monster.findOne({ id: decoded });
  if (!monster) return apiError("monster 를 찾을 수 없습니다.", 404);
  await MonsterRevision.deleteMany({ monsterId: monster._id });
  await monster.deleteOne();
  return apiSuccess({ id: decoded });
}

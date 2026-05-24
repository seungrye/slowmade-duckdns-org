import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Monster from "@/models/monster";

function isValidColor(c: unknown): c is [number, number, number] {
  return Array.isArray(c)
    && c.length === 3
    && c.every((n) => typeof n === "number" && n >= 0 && n <= 1);
}

const VALID_ELEMENTS = ["fire", "ice", "poison", "lightning"];

export async function GET() {
  await connectToDB();
  const monsters = await Monster.find({}).sort({ id: 1 }).lean();
  return apiSuccess(monsters);
}

export async function POST(req: NextRequest) {
  await connectToDB();
  const body = await req.json();

  if (typeof body.id !== "string" || !body.id.trim()) {
    return apiError("id 는 필수입니다.", 400);
  }
  if (typeof body.displayName !== "string" || !body.displayName.trim()) {
    return apiError("displayName 은 필수입니다.", 400);
  }
  if (typeof body.glyph !== "string" || !body.glyph.trim()) {
    return apiError("glyph 은 필수입니다.", 400);
  }
  if (!isValidColor(body.color)) {
    return apiError("color 는 [r, g, b] (각 0.0~1.0) 형식이어야 합니다.", 400);
  }
  if (body.element != null && !VALID_ELEMENTS.includes(body.element)) {
    return apiError(`element 는 ${VALID_ELEMENTS.join("/")} 또는 null 이어야 합니다.`, 400);
  }

  const existing = await Monster.findOne({ id: body.id });
  if (existing) return apiError(`이미 존재하는 monster id 입니다: ${body.id}`, 409);

  const monster = await Monster.create({
    id: body.id,
    displayName: body.displayName,
    glyph: body.glyph,
    color: body.color,
    hp: body.hp ?? 1,
    attack: body.attack ?? 0,
    defense: body.defense ?? 0,
    visionRadius: body.visionRadius ?? 6,
    speed: body.speed ?? 1.0,
    element: body.element ?? null,
    spawnWeight: body.spawnWeight ?? 1.0,
    zones: body.zones ?? [],
    spawnCondition: body.spawnCondition ?? null,
    questOnly: body.questOnly ?? false,
  });

  return apiSuccess(monster, 201);
}

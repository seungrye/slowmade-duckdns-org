import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import StartLoadout from "@/models/start-loadout";
import { validateStartLoadout, normalizeStartLoadout } from "@/lib/start-loadout-validation";
import type { StartLoadoutDef } from "@/types/start-loadout";

// 단일 doc(_id="default") 패턴.
// GET → 현재 doc 반환. 없으면 기본값(gold:50, 나머지 비어있음).
// PUT → upsert.

const FALLBACK_DEFAULT: StartLoadoutDef = {
  gold: 50,
  weapon: null,
  armor: null,
  items: [],
  consumables: [],
};

export async function GET() {
  await connectToDB();
  const doc = await StartLoadout.findById("default").lean();
  if (!doc) {
    return apiSuccess({
      _id: "default",
      ...FALLBACK_DEFAULT,
      version: 0,
    });
  }
  return apiSuccess(doc);
}

export async function PUT(req: NextRequest) {
  await connectToDB();
  const body = await req.json();

  const v = validateStartLoadout(body);
  if (!v.ok) return apiError(v.message, 400);

  const def = normalizeStartLoadout(body as Record<string, unknown>);

  const existing = await StartLoadout.findById("default");
  if (existing) {
    existing.gold = def.gold;
    existing.weapon = def.weapon;
    existing.armor = def.armor;
    existing.items = def.items;
    existing.consumables = def.consumables;
    existing.version = (existing.version ?? 1) + 1;
    await existing.save();
    return apiSuccess(existing);
  } else {
    const created = await StartLoadout.create({
      _id: "default",
      ...def,
      version: 1,
    });
    return apiSuccess(created, 201);
  }
}

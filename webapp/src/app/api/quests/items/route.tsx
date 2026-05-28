import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Item from "@/models/item";
import { validateItemForCreate } from "@/lib/item-validation";
import type { ItemKind } from "@/types/item";

const KINDS: ItemKind[] = ["quest", "weapon", "armor", "consumable", "accessory"];

export async function GET(req: NextRequest) {
  await connectToDB();
  const kindParam = new URL(req.url).searchParams.get("kind");
  const filter: Record<string, unknown> = {};
  if (kindParam) {
    if (!KINDS.includes(kindParam as ItemKind)) {
      return apiError(`지원하지 않는 kind: ${kindParam}`, 400);
    }
    filter.kind = kindParam;
  }
  const items = await Item.find(filter).sort({ kind: 1, id: 1 }).lean();
  return apiSuccess(items);
}

export async function POST(req: NextRequest) {
  await connectToDB();
  const body = await req.json();

  const result = validateItemForCreate(body);
  if (!result.ok) return apiError(result.message, 400);

  const existing = await Item.findOne({ id: body.id });
  if (existing) return apiError(`이미 존재하는 item id 입니다: ${body.id}`, 409);

  const doc: Record<string, unknown> = {
    id: body.id,
    kind: body.kind,
    displayName: body.displayName,
    glyphAscii: body.glyphAscii,
    glyphUnicode: body.glyphUnicode,
    glyphGameIcon: body.glyphGameIcon,
    pickupMessage: body.pickupMessage,
  };
  if (body.kind === "quest") doc.imagePath = body.imagePath;
  else if (body.kind === "weapon") {
    doc.attackPower = body.attackPower;
    if (body.attackPowerMin !== undefined) doc.attackPowerMin = body.attackPowerMin;
    if (body.attackPowerMax !== undefined) doc.attackPowerMax = body.attackPowerMax;
    if (body.tier !== undefined) doc.tier = body.tier;
    doc.element = body.element ?? null;
  }
  else if (body.kind === "armor") {
    doc.defenseBonus = body.defenseBonus;
    if (body.defenseBonusMin !== undefined) doc.defenseBonusMin = body.defenseBonusMin;
    if (body.defenseBonusMax !== undefined) doc.defenseBonusMax = body.defenseBonusMax;
    if (body.tier !== undefined) doc.tier = body.tier;
  }
  else if (body.kind === "consumable") doc.effect = body.effect;
  else if (body.kind === "accessory") doc.desc = body.desc;

  const item = await Item.create(doc);
  return apiSuccess(item, 201);
}

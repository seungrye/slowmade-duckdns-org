import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Item from "@/models/item";
import ItemRevision from "@/models/item-revision";
import { validateKindFields } from "../route";
import type { ItemKind } from "@/types/item";

type Params = { params: Promise<{ id: string }> };

function snapshot(item: Record<string, unknown>): Record<string, unknown> {
  const snap: Record<string, unknown> = {
    id: item.id,
    kind: item.kind,
    displayName: item.displayName,
    glyphAscii: item.glyphAscii,
    glyphUnicode: item.glyphUnicode,
    glyphGameIcon: item.glyphGameIcon,
    pickupMessage: item.pickupMessage,
  };
  switch (item.kind) {
    case "quest":      snap.imagePath = item.imagePath; break;
    case "weapon":     snap.attackPower = item.attackPower; snap.element = item.element ?? null; break;
    case "armor":      snap.defenseBonus = item.defenseBonus; break;
    case "consumable": snap.effect = item.effect; break;
  }
  return snap;
}

export async function GET(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const item = await Item.findOne({ id: decodeURIComponent(id) }).lean();
  if (!item) return apiError("item 을 찾을 수 없습니다.", 404);
  return apiSuccess(item);
}

export async function PUT(req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const body = await req.json();

  const item = await Item.findOne({ id: decoded });
  if (!item) return apiError("item 을 찾을 수 없습니다.", 404);

  // 종별 필드 검증 — 부분 갱신이지만 합쳐진 결과가 invariant 충족해야
  const merged: Record<string, unknown> = {
    imagePath: body.imagePath ?? item.imagePath,
    attackPower: body.attackPower ?? item.attackPower,
    element: body.element !== undefined ? body.element : item.element ?? null,
    defenseBonus: body.defenseBonus ?? item.defenseBonus,
    effect: body.effect ?? item.effect,
  };
  const v = validateKindFields(merged, item.kind as ItemKind);
  if (!v.ok) return apiError(v.message, 400);

  // 갱신 직전 현재 버전 백업
  await ItemRevision.create({
    itemId: item._id,
    version: item.version,
    item: snapshot(item as unknown as Record<string, unknown>),
  });

  if (body.displayName !== undefined) item.displayName = body.displayName;
  if (body.glyphAscii !== undefined) item.glyphAscii = body.glyphAscii;
  if (body.glyphUnicode !== undefined) item.glyphUnicode = body.glyphUnicode;
  if (body.glyphGameIcon !== undefined) item.glyphGameIcon = body.glyphGameIcon;
  if (body.pickupMessage !== undefined) item.pickupMessage = body.pickupMessage;

  switch (item.kind) {
    case "quest":
      if (body.imagePath !== undefined) item.imagePath = body.imagePath;
      break;
    case "weapon":
      if (body.attackPower !== undefined) item.attackPower = body.attackPower;
      if (body.element !== undefined) item.element = body.element;
      break;
    case "armor":
      if (body.defenseBonus !== undefined) item.defenseBonus = body.defenseBonus;
      break;
    case "consumable":
      if (body.effect !== undefined) item.effect = body.effect;
      break;
  }
  item.version = (item.version ?? 1) + 1;

  await item.save();
  return apiSuccess(item);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const item = await Item.findOne({ id: decoded });
  if (!item) return apiError("item 을 찾을 수 없습니다.", 404);
  await ItemRevision.deleteMany({ itemId: item._id });
  await item.deleteOne();
  return apiSuccess({ id: decoded });
}

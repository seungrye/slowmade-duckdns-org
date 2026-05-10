import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Item from "@/models/item";
import ItemRevision from "@/models/item-revision";

type Params = { params: Promise<{ id: string; ver: string }> };

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

export async function POST(_req: NextRequest, { params }: Params) {
  await connectToDB();
  const { id, ver } = await params;
  const decoded = decodeURIComponent(id);
  const version = Number(ver);

  const item = await Item.findOne({ id: decoded });
  if (!item) return apiError("item 을 찾을 수 없습니다.", 404);

  const revision = await ItemRevision.findOne({ itemId: item._id, version })
    .lean<{ item: Record<string, unknown> }>();
  if (!revision) return apiError(`버전 ${version}을 찾을 수 없습니다.`, 404);

  // 현재 상태를 revision 으로 백업 후 덮어쓰기
  await ItemRevision.create({
    itemId: item._id,
    version: item.version,
    item: snapshot(item as unknown as Record<string, unknown>),
  });

  const def = revision.item;
  // kind 자체는 변경 불가 — 무시
  item.displayName = (def.displayName as string) ?? item.displayName;
  item.glyphAscii = (def.glyphAscii as string) ?? item.glyphAscii;
  item.glyphUnicode = (def.glyphUnicode as string) ?? item.glyphUnicode;
  item.glyphGameIcon = (def.glyphGameIcon as string) ?? item.glyphGameIcon;
  item.pickupMessage = (def.pickupMessage as string) ?? item.pickupMessage;
  switch (item.kind) {
    case "quest":      item.imagePath = (def.imagePath as string) ?? item.imagePath; break;
    case "weapon":
      item.attackPower = (def.attackPower as number) ?? item.attackPower;
      item.element = def.element !== undefined ? (def.element as string | null) : item.element;
      break;
    case "armor":      item.defenseBonus = (def.defenseBonus as number) ?? item.defenseBonus; break;
    case "consumable": item.effect = (def.effect as { type: "Heal"; amount: number }) ?? item.effect; break;
  }
  item.version = (item.version ?? 1) + 1;

  await item.save();
  return apiSuccess(item, 200, `버전 ${version}으로 롤백 완료`);
}

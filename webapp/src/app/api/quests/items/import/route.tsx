import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import Item from "@/models/item";
import ItemRevision from "@/models/item-revision";
import {
  parseQuestItemsRon, parseWeaponsRon, parseArmorsRon, parseConsumablesRon,
  parseAccessoriesRon,
} from "@/lib/ron";
import type { ItemDef, ItemKind } from "@/types/item";

const KINDS: ItemKind[] = ["quest", "weapon", "armor", "consumable", "accessory"];

function parseByKind(kind: ItemKind, src: string): ItemDef[] {
  switch (kind) {
    case "quest":      return parseQuestItemsRon(src);
    case "weapon":     return parseWeaponsRon(src);
    case "armor":      return parseArmorsRon(src);
    case "consumable": return parseConsumablesRon(src);
    case "accessory":  return parseAccessoriesRon(src);
  }
}

function snapshot(item: Record<string, unknown>): Record<string, unknown> {
  const snap: Record<string, unknown> = {
    id: item.id,
    kind: item.kind,
    displayName: item.displayName,
    glyphAscii: item.glyphAscii,
    glyphGameIcon: item.glyphGameIcon,
    pickupMessage: item.pickupMessage,
  };
  switch (item.kind) {
    case "quest":      snap.imagePath = item.imagePath; break;
    case "weapon":
      snap.attackPower = item.attackPower;
      if (item.attackPowerMin !== undefined) snap.attackPowerMin = item.attackPowerMin;
      if (item.attackPowerMax !== undefined) snap.attackPowerMax = item.attackPowerMax;
      if (item.tier !== undefined) snap.tier = item.tier;
      snap.element = item.element ?? null;
      break;
    case "armor":
      snap.defenseBonus = item.defenseBonus;
      if (item.defenseBonusMin !== undefined) snap.defenseBonusMin = item.defenseBonusMin;
      if (item.defenseBonusMax !== undefined) snap.defenseBonusMax = item.defenseBonusMax;
      if (item.tier !== undefined) snap.tier = item.tier;
      break;
    case "consumable": snap.effect = item.effect; break;
    case "accessory":  snap.desc = item.desc; break;
  }
  return snap;
}

export async function POST(req: NextRequest) {
  await connectToDB();
  const kindParam = new URL(req.url).searchParams.get("kind");
  if (!kindParam || !KINDS.includes(kindParam as ItemKind)) {
    return apiError(`kind 파라미터 필수 (quest/weapon/armor/consumable/accessory)`, 400);
  }
  const kind = kindParam as ItemKind;

  const body = await req.text();
  let defs: ItemDef[];
  try {
    defs = parseByKind(kind, body);
  } catch (e) {
    return apiError(`RON 파싱 오류: ${(e as Error).message}`, 400);
  }

  let created = 0, updated = 0;
  for (const def of defs) {
    const existing = await Item.findOne({ id: def.id });
    if (existing) {
      if (existing.kind !== kind) {
        return apiError(`id '${def.id}' 가 이미 다른 kind ('${existing.kind}') 로 존재합니다.`, 409);
      }
      // revision 백업
      await ItemRevision.create({
        itemId: existing._id,
        version: existing.version,
        item: snapshot(existing as unknown as Record<string, unknown>),
      });
      // 공통 필드
      existing.displayName = def.displayName;
      existing.glyphAscii = def.glyphAscii;
      existing.glyphGameIcon = def.glyphGameIcon;
      existing.pickupMessage = def.pickupMessage;
      // 종별 필드
      if (def.kind === "quest")           existing.imagePath = def.imagePath;
      else if (def.kind === "weapon") {
        existing.attackPower = def.attackPower;
        existing.attackPowerMin = def.attackPowerMin;
        existing.attackPowerMax = def.attackPowerMax;
        existing.tier = def.tier;
        existing.element = def.element ?? null;
      }
      else if (def.kind === "armor") {
        existing.defenseBonus = def.defenseBonus;
        existing.defenseBonusMin = def.defenseBonusMin;
        existing.defenseBonusMax = def.defenseBonusMax;
        existing.tier = def.tier;
      }
      else if (def.kind === "consumable") existing.effect = def.effect;
      else if (def.kind === "accessory")  existing.desc = def.desc;
      existing.version = (existing.version ?? 1) + 1;
      await existing.save();
      updated++;
    } else {
      const doc: Record<string, unknown> = {
        id: def.id,
        kind: def.kind,
        displayName: def.displayName,
        glyphAscii: def.glyphAscii,
        glyphGameIcon: def.glyphGameIcon,
        pickupMessage: def.pickupMessage,
      };
      if (def.kind === "quest") doc.imagePath = def.imagePath;
      else if (def.kind === "weapon") {
        doc.attackPower = def.attackPower;
        if (def.attackPowerMin !== undefined) doc.attackPowerMin = def.attackPowerMin;
        if (def.attackPowerMax !== undefined) doc.attackPowerMax = def.attackPowerMax;
        if (def.tier !== undefined) doc.tier = def.tier;
        doc.element = def.element ?? null;
      }
      else if (def.kind === "armor") {
        doc.defenseBonus = def.defenseBonus;
        if (def.defenseBonusMin !== undefined) doc.defenseBonusMin = def.defenseBonusMin;
        if (def.defenseBonusMax !== undefined) doc.defenseBonusMax = def.defenseBonusMax;
        if (def.tier !== undefined) doc.tier = def.tier;
      }
      else if (def.kind === "consumable") doc.effect = def.effect;
      else if (def.kind === "accessory")  doc.desc = def.desc;
      await Item.create(doc);
      created++;
    }
  }
  return apiSuccess({ created, updated });
}

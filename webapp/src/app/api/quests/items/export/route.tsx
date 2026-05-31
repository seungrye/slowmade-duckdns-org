import { NextRequest } from "next/server";
import { connectToDB } from "@/lib/db";
import { apiError } from "@/lib/api-response";
import Item from "@/models/item";
import {
  serializeQuestItemsRon, serializeWeaponsRon,
  serializeArmorsRon, serializeConsumablesRon,
  serializeAccessoriesRon,
} from "@/lib/ron";
import type { ItemDef, ItemKind, WeaponElement } from "@/types/item";

const KINDS: ItemKind[] = ["quest", "weapon", "armor", "consumable", "accessory"];

const FILENAMES: Record<ItemKind, string> = {
  quest: "quest_items.ron",
  weapon: "weapons.ron",
  armor: "armors.ron",
  consumable: "consumables.ron",
  accessory: "accessories.ron",
};

function serializeByKind(kind: ItemKind, items: ItemDef[]): string {
  switch (kind) {
    case "quest":
      return serializeQuestItemsRon(items.filter((i): i is Extract<ItemDef, { kind: "quest" }> => i.kind === "quest"));
    case "weapon":
      return serializeWeaponsRon(items.filter((i): i is Extract<ItemDef, { kind: "weapon" }> => i.kind === "weapon"));
    case "armor":
      return serializeArmorsRon(items.filter((i): i is Extract<ItemDef, { kind: "armor" }> => i.kind === "armor"));
    case "consumable":
      return serializeConsumablesRon(items.filter((i): i is Extract<ItemDef, { kind: "consumable" }> => i.kind === "consumable"));
    case "accessory":
      return serializeAccessoriesRon(items.filter((i): i is Extract<ItemDef, { kind: "accessory" }> => i.kind === "accessory"));
  }
}

function toItemDef(d: Record<string, unknown>): ItemDef {
  const base = {
    id: d.id as string,
    displayName: d.displayName as string,
    glyphAscii: d.glyphAscii as string,
    glyphGameIcon: d.glyphGameIcon as string,
    pickupMessage: d.pickupMessage as string,
  };
  switch (d.kind) {
    case "quest":
      return { kind: "quest", ...base, imagePath: (d.imagePath as string) ?? "" };
    case "weapon": {
      const w: Extract<ItemDef, { kind: "weapon" }> = {
        kind: "weapon", ...base,
        attackPower: (d.attackPower as number) ?? 0,
        element: (d.element as WeaponElement | null | undefined) ?? null,
      };
      if (typeof d.attackPowerMin === "number") w.attackPowerMin = d.attackPowerMin;
      if (typeof d.attackPowerMax === "number") w.attackPowerMax = d.attackPowerMax;
      if (typeof d.tier === "number") w.tier = d.tier;
      return w;
    }
    case "armor": {
      const a: Extract<ItemDef, { kind: "armor" }> = {
        kind: "armor", ...base, defenseBonus: (d.defenseBonus as number) ?? 0,
      };
      if (typeof d.defenseBonusMin === "number") a.defenseBonusMin = d.defenseBonusMin;
      if (typeof d.defenseBonusMax === "number") a.defenseBonusMax = d.defenseBonusMax;
      if (typeof d.tier === "number") a.tier = d.tier;
      return a;
    }
    case "consumable":
      return {
        kind: "consumable", ...base,
        effect: (d.effect as { type: "Heal"; amount: number }) ?? { type: "Heal", amount: 0 },
      };
    case "accessory":
      return {
        kind: "accessory", ...base,
        desc: (d.desc as string) ?? "",
      };
    default:
      throw new Error(`Unknown kind: ${d.kind}`);
  }
}

export async function GET(req: NextRequest) {
  await connectToDB();
  const kindParam = new URL(req.url).searchParams.get("kind");
  if (!kindParam || !KINDS.includes(kindParam as ItemKind)) {
    return apiError(`kind 파라미터 필수 (quest/weapon/armor/consumable/accessory)`, 400);
  }
  const kind = kindParam as ItemKind;

  const docs = await Item.find({ kind }).sort({ id: 1 }).lean();
  const items: ItemDef[] = (docs as unknown as Record<string, unknown>[]).map(toItemDef);

  const ron = serializeByKind(kind, items);
  return new Response(ron, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${FILENAMES[kind]}"`,
    },
  });
}

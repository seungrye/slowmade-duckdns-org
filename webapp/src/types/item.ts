// Rust `QuestItemDef` / `WeaponDef` / `ArmorDef` / `ConsumableDef` 와 일치
// — 단일 컬렉션 + kind 변별자 형태로 webapp 에 통합 저장

export type ItemKind = "quest" | "weapon" | "armor" | "consumable";

export type WeaponElement = "fire" | "ice" | "lightning";

export type ConsumableEffect = { type: "Heal"; amount: number };

interface ItemBase {
  id: string;
  displayName: string;
  glyphAscii: string;
  glyphUnicode: string;
  glyphGameIcon: string;
  pickupMessage: string;
}

export type ItemDef =
  | (ItemBase & { kind: "quest"; imagePath: string })
  | (ItemBase & { kind: "weapon"; attackPower: number; element: WeaponElement | null })
  | (ItemBase & { kind: "armor"; defenseBonus: number })
  | (ItemBase & { kind: "consumable"; effect: ConsumableEffect });

export type ItemDocument = ItemDef & {
  _id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export interface ItemRevisionDocument {
  _id: string;
  itemId: string;
  version: number;
  item: ItemDef;
  createdAt: string;
}

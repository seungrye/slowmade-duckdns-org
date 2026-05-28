// Rust `QuestItemDef` / `WeaponDef` / `ArmorDef` / `ConsumableDef` / `AccessoryDef`
// 와 일치 — 단일 컬렉션 + kind 변별자 형태로 webapp 에 통합 저장.
//
// "accessory" 는 통계 영향 없는 장신구 (scout_lens / trap_scope 등).
// 효과는 게임 코드가 id 로 분기한다(잠입·함정 도구).

export type ItemKind = "quest" | "weapon" | "armor" | "consumable" | "accessory";

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

// 무기/방어구의 랜덤 스탯 모드 — 게임이 RON 에 attack_power_min/max + tier 를 두고
// 드롭 시 그 범위에서 롤한다. 기존 단일값(attackPower / defenseBonus)도 호환을 위해
// 그대로 유지하며, 신규 필드가 있으면 그것을 우선한다.
// tier 는 1..=5 정수 (게임의 드롭 테이블/난이도 통제).
export type ItemDef =
  | (ItemBase & { kind: "quest"; imagePath: string })
  | (ItemBase & {
      kind: "weapon";
      attackPower: number;
      attackPowerMin?: number;
      attackPowerMax?: number;
      tier?: number;
      element: WeaponElement | null;
    })
  | (ItemBase & {
      kind: "armor";
      defenseBonus: number;
      defenseBonusMin?: number;
      defenseBonusMax?: number;
      tier?: number;
    })
  | (ItemBase & { kind: "consumable"; effect: ConsumableEffect })
  | (ItemBase & { kind: "accessory"; desc: string });

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

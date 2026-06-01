// Rust `QuestItemDef` / `WeaponDef` / `ArmorDef` / `ConsumableDef` / `AccessoryDef`
// 와 일치 — 단일 컬렉션 + kind 변별자 형태로 webapp 에 통합 저장.
//
// "accessory" 는 통계 영향 없는 장신구 (scout_lens / trap_scope 등).
// 효과는 게임 코드가 id 가 아닌 `effects` 키 목록으로 분기한다.

export type ItemKind = "quest" | "weapon" | "armor" | "consumable" | "accessory";

export type WeaponElement = "fire" | "ice" | "lightning";

export type ConsumableEffect = { type: "Heal"; amount: number };

/**
 * 액세서리의 데이터 주도 효과 키 — Rust 측 `AccessoryEffect` enum 과 1:1 대응.
 * id 가 아닌 이 키로 게임 동작이 결정되므로, UI 에서 효과 조합을 자유롭게 바꿀 수 있다.
 *
 * 추가 시: Rust enum / 본 union / UI 라벨 3 곳을 함께 업데이트.
 */
export type AccessoryEffect =
  | "RevealGuardVision"
  | "RevealTrapsInSight"
  | "RevealVendorVision";

/** UI 표시용 한국어 라벨 — 편집 화면 멀티셀렉트 옵션에 사용. */
export const ACCESSORY_EFFECT_LABELS: Record<AccessoryEffect, string> = {
  RevealGuardVision: "가드 시야 노출 (잠입)",
  RevealTrapsInSight: "함정 시야 노출 (함정)",
  RevealVendorVision: "상인 시야 노출 (잠입)",
};

export const ACCESSORY_EFFECTS: AccessoryEffect[] = [
  "RevealGuardVision",
  "RevealTrapsInSight",
  "RevealVendorVision",
];

interface ItemBase {
  id: string;
  displayName: string;
  glyphAscii: string;
  glyphGameIcon: string;
  pickupMessage: string;
  /**
   * 일반 vendor 인벤토리에 노출되지 않게 할지 여부. true 면 vendor 가 이 아이템을
   * 판매 인벤토리에 자동 편성하지 않는다 (퀘스트 spawn 같은 명시적 경로는 별도).
   * `#[serde(default)]` 미러 — 누락은 false (기존 RON 호환).
   */
  hidden?: boolean;
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
  | (ItemBase & { kind: "accessory"; desc: string; effects?: AccessoryEffect[] });

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

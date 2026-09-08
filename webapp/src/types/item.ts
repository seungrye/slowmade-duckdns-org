// Rust `QuestItemDef` / `WeaponDef` / `ArmorDef` / `ConsumableDef` / `AccessoryDef`
// Matching it - stored in webapp as a single collection with a kind discriminator.
//
// "accessory" is a trinket with no effect on the stats (scout_lens, trap_scope and so on).
// The game code branches on the `effects` key list rather than the id.

export type ItemKind = "quest" | "weapon" | "armor" | "consumable" | "accessory";

export type WeaponElement = "fire" | "ice" | "lightning";

export type ConsumableEffect = { type: "Heal"; amount: number };

/**
 * An accessory's data-driven effect keys - corresponding 1:1 to the Rust `AccessoryEffect` enum.
 * The game's behaviour is decided by these keys rather than the id, so the UI can recombine effects freely.
 *
 * When adding one: update the Rust enum, this union and the UI's labels together.
 */
export type AccessoryEffect =
  | "RevealGuardVision"
  | "RevealTrapsInSight"
  | "RevealVendorVision";

/** The Korean labels for the UI - used by the editing screen's multi-select options. */
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
   * Whether to keep it out of an ordinary vendor's inventory. With true, a vendor never places this item
   * into its stock automatically (an explicit path such as a quest spawn is separate).
   * Mirroring `#[serde(default)]` - absent means false (compatible with the existing RON).
   */
  hidden?: boolean;
  /**
   * The shop system - the vendor -> player purchase price. undefined/null means not for sale.
   * Mirroring the game's `Option<u32>`. Absent, the game falls back to SHOP_CATALOG (phase 2).
   * Negative is not allowed; 0 is meaningfully permitted as a free sale.
   */
  buyPrice?: number;
  /**
   * The shop system - the player -> vendor sale price. undefined/null gives buyPrice/2 automatically.
   * Mirroring the game's `Option<u32>`. Absent, the game infers its default.
   */
  sellPrice?: number;
}

// The weapons' and armour's random-stat mode - the game keeps attack_power_min/max plus tier in the RON
// and rolls within that range on a drop. The old single values (attackPower / defenseBonus) are kept
// for compatibility, and the new fields take precedence where present.
// tier is an integer 1..=5 (controlling the game's drop table and difficulty).
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

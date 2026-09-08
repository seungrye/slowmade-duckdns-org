// Matching the Rust `VillagerDef` - bevy-rogue's villagers.ron format

import type { ZoneIdValue } from "./zone";

/**
 * A villager's home landmark (within the Town zone only).
 *
 * Mirroring the game's `HomeLandmark` Rust enum:
 *   - `random` - any floor tile (the default, keeping the previous behaviour)
 *   - `road`   - the road tiles
 *   - the 13 landmarks - Inn / Smithy / Temple / Guard / Market / Manor /
 *                  Tavern / Herbalist / Graveyard / Jail / Guild /
 *                  Alchemist / Docks
 *
 * When the game has `home_zone == Town` and that landmark is in TownConfig.landmarks,
 * it spawns on any floor tile inside that area. When the landmark is inactive or the zone is not Town,
 * it falls back to Random.
 *
 * TS uses kebab/lowercase and the RON serialises as PascalCase (see serializeVillagersRon).
 */
export type HomeLandmark =
  | "random"
  | "road"
  | "inn"
  | "smithy"
  | "temple"
  | "guard"
  | "market"
  | "manor"
  | "tavern"
  | "herbalist"
  | "graveyard"
  | "jail"
  | "guild"
  | "alchemist"
  | "docks";

export const HOME_LANDMARKS: readonly HomeLandmark[] = [
  "random", "road",
  "inn", "smithy", "temple", "guard", "market", "manor",
  "tavern", "herbalist", "graveyard", "jail", "guild", "alchemist", "docks",
] as const;

/** The Korean labels - for the UI's display (the game uses a PascalCase enum). */
export const HOME_LANDMARK_LABEL: Record<HomeLandmark, string> = {
  random:    "임의 위치 (Random) — 기본",
  road:      "도로 (Road)",
  inn:       "여관 (Inn)",
  smithy:    "대장간 (Smithy)",
  temple:    "신전 (Temple)",
  guard:     "경비초소 (Guard)",
  market:    "시장 (Market)",
  manor:     "영주 저택 (Manor)",
  tavern:    "선술집 (Tavern)",
  herbalist: "약초집 (Herbalist)",
  graveyard: "무덤 (Graveyard)",
  jail:      "감옥 (Jail)",
  guild:     "길드 (Guild)",
  alchemist: "연금술공방 (Alchemist)",
  docks:     "부두 (Docks)",
};

export interface VillagerDef {
  /** The unique identifier (snake_case). Referenced by a quest's giver_npc and KillNpc. */
  id: string;
  /** The name for the UI and dialogue (not guaranteed unique) */
  name: string;
  /** RGB 0.0~1.0 */
  color: [number, number, number];
  dialogs: string[];
  speed: number;
  /** A stationary resident - true keeps them in place every turn (a merchant behind a stall and so on). false by default. */
  stationary?: boolean;
  /** A merchant - true opens a shop on interaction. false by default. */
  vendor?: boolean;
  /**
   * The NPC's home zone - the game spawns this NPC only on that zone's town map.
   * The default is `{ type: "Town" }`, which is 100% compatible with the existing RON (unset means the starting town).
   * State it to spread them into new town zones such as MountainVillage or SeasideHarbor.
   * The same meaning as the game's `#[serde(default = "default_home_zone")]`.
   */
  homeZone?: ZoneIdValue;
  /**
   * The home landmark - within the Town zone only (ignored in other zones, falling back to Random).
   * Unset or absent it is `"random"` (mirroring the game's `#[serde(default)] HomeLandmark::Random`).
   */
  homeLandmark?: HomeLandmark;
  /**
   * Free roaming - true lets them move anywhere (the previous behaviour). false (the default) confines them to their home area:
   *   - homeLandmark = a specific landmark -> inside that landmark's room
   *   - homeLandmark = "random" -> inside that villager's named home
   *   - homeLandmark = "road"   -> along the road tiles
   * Mirroring the game's `#[serde(default)] free_roam: false`.
   */
  freeRoam?: boolean;
  /**
   * A vendor's (`vendor: true`) vision radius, in tiles. When the `RevealVendorVision`
   * accessory effect is active, the FOV at this radius is shown as a purple overlay.
   *
   * Unset (`undefined` / `null`), the game's fallback default (6 tiles) is used.
   * Stated, that radius applies to that vendor alone (market_owner uses 2, covering the shop's interior only).
   *
   * Ignored on an NPC with `vendor: false` (the overlay is drawn for vendors only).
   * Mirroring the game's `#[serde(default)] vendor_vision_radius: Option<u32>`.
   */
  vendorVisionRadius?: number | null;
  /**
   * The shop inventory - the list of item ids this vendor sells.
   * - `undefined` (the field absent) -> the game's hard-coded SHOP_CATALOG fallback (phase 2).
   * - `[]` (an empty array) -> an explicitly empty shop (meaning something different from None).
   * - `[...]` -> only those ids are sold (the game excludes an item whose buyPrice is None).
   *
   * The game's RON serialisation expresses it as an `Option<Vec<String>>`:
   *   - undefined -> the field is omitted
   *   - []        -> `vendor_inventory: Some([])`
   *   - [...]     -> `vendor_inventory: Some([...])`
   *
   * Meaningless on an NPC with `vendor: false` (the game ignores it).
   */
  vendorInventory?: string[];
}

export interface VillagerDocument extends VillagerDef {
  _id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface VillagerRevisionDocument {
  _id: string;
  villagerId: string;
  version: number;
  villager: VillagerDef;
  createdAt: string;
}

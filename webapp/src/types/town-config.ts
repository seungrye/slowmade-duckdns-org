// The generation options for the starting town (Town, ZoneId::Town).
// Mapped 1:1 onto the game's `TownOptions` (bevy-rogue: src/modules/map/generators/town.rs).
//
// The game catalogue is read-only - these options apply only to the single system zone (Town)
// hard-coded in the code. Edited in the site UI (`SystemZonesPanel`) -> stored as a single DB doc (_id="default")
// -> included in /api/game/content/v1's RON export -> fetched by the game's wasm.

export type TownSize = "hamlet" | "village" | "town";
export type TownRoads = "radial" | "linear" | "random";
export type TownWealth = "poor" | "common" | "wealthy";
export type TownDefenses = "none" | "wooden" | "stone";
/**
 * The 13 landmark identifiers. Whether each is shown branches on the size and environment combination.
 *   - Hamlet+ : inn / smithy / tavern / herbalist / graveyard (plus docks if coastal)
 *   - Village+: the above plus temple / guard / market / jail / guild
 *   - Town    : the above plus manor / alchemist
 *   - docks   : shown under the Coastal environment only (Hamlet+).
 */
export type TownLandmark =
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

/**
 * The town's geography. Plains is the default - the coast-only landmark (docks) is disabled.
 * Coastal shows docks, and the game's generator puts a strip of Water along one outer edge.
 */
export type TownEnvironment = "plains" | "coastal";

export type TownAlgorithm = "grid" | "tinykeep" | "watabou";

export interface TownConfig {
  size: TownSize;
  algorithm: TownAlgorithm;
  roads: TownRoads;
  wealth: TownWealth;
  defenses: TownDefenses;
  landmarks: TownLandmark[];
  fields: boolean;
  environment: TownEnvironment;
}

export const TOWN_SIZES: readonly TownSize[] = ["hamlet", "village", "town"] as const;
export const TOWN_ALGORITHMS: readonly TownAlgorithm[] = ["grid", "tinykeep", "watabou"] as const;
export const TOWN_ROADS: readonly TownRoads[] = ["radial", "linear", "random"] as const;
export const TOWN_WEALTHS: readonly TownWealth[] = ["poor", "common", "wealthy"] as const;
export const TOWN_DEFENSES: readonly TownDefenses[] = ["none", "wooden", "stone"] as const;
export const TOWN_LANDMARKS: readonly TownLandmark[] = [
  "inn", "smithy", "temple", "guard", "market", "manor",
  "tavern", "herbalist", "graveyard", "jail", "guild", "alchemist", "docks",
] as const;
export const TOWN_ENVIRONMENTS: readonly TownEnvironment[] = ["plains", "coastal"] as const;

export const TOWN_CONFIG_DEFAULTS: TownConfig = {
  size: "village",
  algorithm: "grid",
  roads: "radial",
  wealth: "common",
  defenses: "none",
  landmarks: ["inn", "smithy"],
  fields: true,
  environment: "plains",
};

export interface TownConfigDocument extends TownConfig {
  _id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// The Korean labels - for the UI's display (the game uses the kebab-case enum as it is).
export const TOWN_SIZE_LABEL: Record<TownSize, string> = {
  hamlet: "Hamlet (작은 촌락)",
  village: "Village (마을)",
  town: "Town (큰 마을)",
};
export const TOWN_ALGORITHM_LABEL: Record<TownAlgorithm, string> = {
  grid: "Grid (격자 — 현재)",
  tinykeep: "Tinykeep (밀집 + 흙길) — 미구현",
  watabou: "Watabou (회전 마름모) — 미구현",
};
export const TOWN_ROADS_LABEL: Record<TownRoads, string> = {
  radial: "Radial (중앙 광장 + 방사형)",
  linear: "Linear (한 줄 도로)",
  random: "Random (구불구불)",
};
export const TOWN_WEALTH_LABEL: Record<TownWealth, string> = {
  poor: "Poor (작은 집 다수)",
  common: "Common (보통)",
  wealthy: "Wealthy (큰 저택 일부)",
};
export const TOWN_DEFENSES_LABEL: Record<TownDefenses, string> = {
  none: "None (없음)",
  wooden: "Wooden (목책)",
  stone: "Stone (석벽)",
};
export const TOWN_LANDMARK_LABEL: Record<TownLandmark, string> = {
  inn: "Inn (여관)",
  smithy: "Smithy (대장간)",
  temple: "Temple (신전)",
  guard: "Guard (경비초소)",
  market: "Market (시장)",
  manor: "Manor (영주 저택)",
  tavern: "Tavern (선술집)",
  herbalist: "Herbalist (약초집)",
  graveyard: "Graveyard (무덤)",
  jail: "Jail (감옥)",
  guild: "Guild (길드)",
  alchemist: "Alchemist (연금술공방)",
  docks: "Docks (부두)",
};
export const TOWN_ENVIRONMENT_LABEL: Record<TownEnvironment, string> = {
  plains: "Plains (평원)",
  coastal: "Coastal (해안)",
};

// -- what is shown per size and environment ---------------------------------

/**
 * The size groups - Hamlet is a subset of Village is a subset of Town (Town is the superset of every landmark).
 * Docks is added only when the environment is Coastal.
 */
const HAMLET_BASE: readonly TownLandmark[] = [
  "inn", "smithy", "tavern", "herbalist", "graveyard",
];
const VILLAGE_ADDITIONS: readonly TownLandmark[] = [
  "temple", "guard", "market", "jail", "guild",
];
const TOWN_ADDITIONS: readonly TownLandmark[] = [
  "manor", "alchemist",
];

/**
 * The landmarks selectable in an environment.
 * A policy change: size is ignored - all 12 landmarks are always available. Only env matters
 * (Docks is added under Coastal alone).
 */
export function availableLandmarks(
  _size: TownSize,
  env: TownEnvironment,
): TownLandmark[] {
  const out: TownLandmark[] = [
    ...HAMLET_BASE,
    ...VILLAGE_ADDITIONS,
    ...TOWN_ADDITIONS,
  ];
  if (env === "coastal") out.push("docks");
  return out;
}

/** Whether the given landmark is shown and allowed in the environment (size ignored). */
export function isLandmarkAvailable(
  l: TownLandmark, size: TownSize, env: TownEnvironment,
): boolean {
  return availableLandmarks(size, env).includes(l);
}

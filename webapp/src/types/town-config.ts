// 시작 마을(Town, ZoneId::Town) 생성 옵션.
// 게임 측 `TownOptions` (bevy-rogue: src/modules/map/generators/town.rs) 와 1:1 매핑.
//
// 게임 카탈로그 read-only — 이 옵션은 코드에 박힌 단일 시스템 zone(Town) 에만
// 적용된다. 사이트 UI(`SystemZonesPanel`) 에서 편집 → DB 단일 doc(_id="default")
// 저장 → /api/game/content/v1 RON export 에 포함 → 게임 wasm 이 fetch.

export type TownSize = "hamlet" | "village" | "town";
export type TownRoads = "radial" | "linear" | "random";
export type TownWealth = "poor" | "common" | "wealthy";
export type TownDefenses = "none" | "wooden" | "stone";
/**
 * 13 landmark 식별자. 사이즈/환경 조합으로 노출 여부가 분기된다.
 *   - Hamlet+ : inn / smithy / tavern / herbalist / graveyard (+docks if coastal)
 *   - Village+: 위 + temple / guard / market / jail / guild
 *   - Town    : 위 + manor / alchemist
 *   - docks   : Coastal 환경에서만 노출 (Hamlet+).
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
 * 마을의 지리 환경. Plains 는 기본 — 해안 전용 landmark(docks) 가 비활성화된다.
 * Coastal 은 docks 가 노출되고, 게임 측 generator 가 외곽 한 변에 Water 띠를 둔다.
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

// 한글 라벨 — UI 표시용 (game 측은 kebab-case enum 그대로 사용).
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

// ── 사이즈/환경별 노출 ────────────────────────────────────────────────────────

/**
 * 사이즈 그룹 — Hamlet ⊂ Village ⊂ Town (Town 은 모든 landmark 의 슈퍼셋).
 * Docks 는 환경 = Coastal 일 때만 추가된다.
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
 * 환경에서 선택 가능한 landmark 목록.
 * 정책 변경: size 무시 — 모든 12 종 landmark 가 항상 사용 가능. env 만 의미
 * (Coastal 일 때만 Docks 추가).
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

/** 주어진 landmark 가 환경에서 노출/허용되는지 여부 (size 무시). */
export function isLandmarkAvailable(
  l: TownLandmark, size: TownSize, env: TownEnvironment,
): boolean {
  return availableLandmarks(size, env).includes(l);
}

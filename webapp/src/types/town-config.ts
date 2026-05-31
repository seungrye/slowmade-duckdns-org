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
export type TownLandmark = "inn" | "smithy" | "temple" | "guard" | "market" | "manor";

export interface TownConfig {
  size: TownSize;
  roads: TownRoads;
  wealth: TownWealth;
  defenses: TownDefenses;
  landmarks: TownLandmark[];
  fields: boolean;
}

export const TOWN_SIZES: readonly TownSize[] = ["hamlet", "village", "town"] as const;
export const TOWN_ROADS: readonly TownRoads[] = ["radial", "linear", "random"] as const;
export const TOWN_WEALTHS: readonly TownWealth[] = ["poor", "common", "wealthy"] as const;
export const TOWN_DEFENSES: readonly TownDefenses[] = ["none", "wooden", "stone"] as const;
export const TOWN_LANDMARKS: readonly TownLandmark[] = [
  "inn", "smithy", "temple", "guard", "market", "manor",
] as const;

export const TOWN_CONFIG_DEFAULTS: TownConfig = {
  size: "village",
  roads: "radial",
  wealth: "common",
  defenses: "none",
  landmarks: ["inn", "smithy"],
  fields: true,
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
  guard: "Guard (초소)",
  market: "Market (시장)",
  manor: "Manor (대저택)",
};

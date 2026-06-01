// Rust `VillagerDef` 와 일치 — bevy-rogue 의 villagers.ron 형식

import type { ZoneIdValue } from "./zone";

/**
 * Villager 의 거주 landmark (Town zone 한정).
 *
 * 게임 측 `HomeLandmark` Rust enum 미러:
 *   - `random` — 임의 floor tile (기본값, 기존 동작 유지)
 *   - `road`   — 도로(road) 타일군
 *   - 13 landmark — Inn / Smithy / Temple / Guard / Market / Manor /
 *                  Tavern / Herbalist / Graveyard / Jail / Guild /
 *                  Alchemist / Docks
 *
 * 게임 측에서 `home_zone == Town` 이고 해당 landmark 가 TownConfig.landmarks 에
 * 포함된 경우 그 영역 내부 임의 floor tile 에 spawn. 비활성/Town 외 zone 이면
 * Random fallback.
 *
 * TS 는 kebab/lowercase, RON 은 PascalCase 로 직렬화한다(serializeVillagersRon 참조).
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

/** 한글 라벨 — UI 표시용 (game 측은 PascalCase enum). */
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
  /** unique 식별자 (snake_case). 퀘스트 giver_npc / KillNpc 가 참조. */
  id: string;
  /** UI/dialog 표시용 이름 (unique 보장 X) */
  name: string;
  /** RGB 0.0~1.0 */
  color: [number, number, number];
  dialogs: string[];
  speed: number;
  /** 정지 주민 — true 면 매 턴 제자리(가판대 뒤 상인 등). 기본 false. */
  stationary?: boolean;
  /** 상인 — true 면 상호작용 시 상점이 열린다. 기본 false. */
  vendor?: boolean;
  /**
   * NPC 거주 zone — 이 zone 의 마을 맵에서만 게임이 이 NPC 를 스폰한다.
   * 기본값은 `{ type: "Town" }` 으로, 기존 RON 과 100% 호환된다(미지정 시 시작 마을).
   * MountainVillage/SeasideHarbor 등 신규 마을 zone 으로 분산하려면 명시한다.
   * 게임 측 `#[serde(default = "default_home_zone")]` 와 동일한 의미.
   */
  homeZone?: ZoneIdValue;
  /**
   * 거주 landmark — Town zone 한정 (그 외 zone 에서는 무시되고 Random fallback).
   * 미지정/누락 시 `"random"` (게임 측 `#[serde(default)] HomeLandmark::Random` 미러).
   */
  homeLandmark?: HomeLandmark;
  /**
   * 자유 이동 — true 면 어디든 이동 (기존 동작). false (기본) 면 거주 영역 안만:
   *   - homeLandmark = specific landmark → 그 landmark room 안
   *   - homeLandmark = "random" → 그 villager 의 명명 거주 집 안
   *   - homeLandmark = "road"   → 도로 타일 따라
   * 게임 측 `#[serde(default)] free_roam: false` 미러.
   */
  freeRoam?: boolean;
  /**
   * vendor (`vendor: true`) 의 시야 반경 (타일 단위). `RevealVendorVision`
   * 액세서리 효과가 활성일 때 이 반경의 FOV 가 보라색 오버레이로 표시된다.
   *
   * 미지정 (`undefined` / `null`) 시 게임 측 fallback default (6 타일) 사용.
   * 명시 시 그 vendor 만 해당 반경 적용 (예: market_owner 는 2 로 상점 내부만).
   *
   * `vendor: false` 인 NPC 에서는 무시된다 (오버레이는 vendor 만 그린다).
   * 게임 측 `#[serde(default)] vendor_vision_radius: Option<u32>` 미러.
   */
  vendorVisionRadius?: number | null;
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

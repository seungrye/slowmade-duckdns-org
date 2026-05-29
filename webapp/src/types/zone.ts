// Named 존 정의 — bevy-rogue 의 OpenPortal 액션이 등록하는 동적 zone 의
// webapp 측 메타 카탈로그. RON 파일 1:1 대응은 없음.

/**
 * 게임의 정적 `ZoneId` enum 변형들의 TS 미러. villager `homeZone` 등에서 사용.
 *
 * 게임 측 `src/modules/zone/mod.rs` 의 `pub enum ZoneId` 와 1:1 일치:
 *   - `Town` — 시작 마을
 *   - `MountainVillage` — 산속 마을 (사냥꾼/광부/전사)
 *   - `SeasideHarbor` — 항구 마을 (탐험가/마법사/보물사냥꾼)
 *   - `Forest` — 숲
 *   - `Dungeon(N)` — 던전 N층
 *   - `Named("…")` — 퀘스트가 동적으로 만드는 zone
 *
 * RON 인코딩(자세한 건 `lib/ron.ts` 의 villager 직렬화):
 *   - `Town` / `MountainVillage` / `SeasideHarbor` / `Forest` — bare ident
 *   - `Dungeon(2)` / `Named("herb_glade")` — paren 형식
 */
export type ZoneIdValue =
  | { type: "Town" }
  | { type: "MountainVillage" }
  | { type: "SeasideHarbor" }
  | { type: "Forest" }
  | { type: "Dungeon"; level: number }
  | { type: "Named"; id: string };

/** Human-readable label for `ZoneIdValue` — UI select/표시에 사용. */
export function zoneIdLabel(z: ZoneIdValue): string {
  switch (z.type) {
    case "Town":            return "마을 (Town)";
    case "MountainVillage": return "산속 마을 (MountainVillage)";
    case "SeasideHarbor":   return "항구 마을 (SeasideHarbor)";
    case "Forest":          return "숲 (Forest)";
    case "Dungeon":         return `던전 ${z.level}층 (Dungeon)`;
    case "Named":           return `Named("${z.id}")`;
  }
}

export interface ZoneDef {
  name: string;
  /** 맵 생성기 (bsp / forest / cellular_automata / bsp_indoor / organic_village 등) */
  generator: string;
  description?: string;
}

export interface ZoneDocument extends ZoneDef {
  _id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ZoneRevisionDocument {
  _id: string;
  zoneId: string;
  version: number;
  zone: ZoneDef;
  createdAt: string;
}

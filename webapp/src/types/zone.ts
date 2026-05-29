// Named 존 정의 — bevy-rogue 의 OpenPortal 액션이 등록하는 동적 zone 의
// webapp 측 메타 카탈로그. RON 파일 1:1 대응은 없음.

/**
 * 게임의 `ZoneId` enum 변형들의 TS 미러. villager `homeZone` 등에서 사용.
 *
 * 게임 측 `src/modules/zone/mod.rs` 의 `pub enum ZoneId` 와 1:1 일치:
 *   - `Town` — 시작 마을 (유일한 정적 variant)
 *   - `Named("…")` — 그 외 모든 zone (forest / dungeon_N / mountain_village /
 *     seaside_harbor / 퀘스트 동적 zone 모두 포함)
 *
 * 표준 Named id:
 *   - `"forest"` — 숲
 *   - `"dungeon_<N>"` — 던전 N층
 *   - `"mountain_village"` — 산속 마을
 *   - `"seaside_harbor"` — 항구 마을
 *
 * RON 인코딩(자세한 건 `lib/ron.ts` 의 villager 직렬화):
 *   - `Town` — bare ident
 *   - `Named("herb_glade")` — paren 형식
 *
 * 호환: 옛 RON 의 `Forest` / `Dungeon(N)` / `MountainVillage` / `SeasideHarbor`
 * 도 파서 측에서 자동으로 Named 표현으로 흡수된다.
 */
export type ZoneIdValue =
  | { type: "Town" }
  | { type: "Named"; id: string };

/** Human-readable label for `ZoneIdValue` — UI select/표시에 사용. */
export function zoneIdLabel(z: ZoneIdValue): string {
  if (z.type === "Town") return "마을 (Town)";
  // 표준 Named id 에는 친근한 라벨, 그 외엔 raw 식별자.
  switch (z.id) {
    case "forest":           return "숲 (forest)";
    case "mountain_village": return "산속 마을 (mountain_village)";
    case "seaside_harbor":   return "항구 마을 (seaside_harbor)";
    default: {
      const m = /^dungeon_(\d+)$/.exec(z.id);
      if (m) return `던전 ${m[1]}층 (${z.id})`;
      return `Named("${z.id}")`;
    }
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

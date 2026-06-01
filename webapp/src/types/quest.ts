import type { HomeLandmark } from "./villager";

// ── 조건 타입 ──────────────────────────────────────────────────────────────

export type Condition =
  | { type: "FlagIs"; flag: string; value: string }
  | { type: "HasFlag"; flag: string }
  | { type: "HasItem"; itemId: string }
  | { type: "Always" }
  | { type: "And"; conditions: Condition[] }
  | { type: "Or"; conditions: Condition[] }
  | { type: "Not"; condition: Condition }
  | { type: "PhaseIs"; quest: string; phase: string }
  | { type: "InZone"; zone: SpawnZone };

// ── 포털 배치 ─────────────────────────────────────────────────────────────

export type PortalPlacement =
  | { type: "InsideRoom" }
  | { type: "Border" }
  | { type: "Random" }
  | { type: "NearGiver"; radius: number };

// ── 액션 타입 ─────────────────────────────────────────────────────────────

/** 함정 종류 (bevy-rogue trap::TrapKind 미러). */
export type TrapKind = "Spike" | "Poison" | "Alarm" | "Teleport";

export type Action =
  | { type: "Log"; text: string }
  | { type: "GiveItem"; itemId: string }
  | { type: "GiveItems"; itemId: string; count: number }
  | { type: "RemoveItem"; itemId: string }
  /**
   * 인벤토리에서 `itemId` 를 `count` 개까지 회수한다. count 미지정 시 1.
   * 게임 `QuestAction::RemoveItems { item, count: Option<u32> }` 미러.
   * `RemoveItem` 의 수량 확장형 — 잠입 실패 시 여러 개 회수 같은 시나리오.
   */
  | { type: "RemoveItems"; itemId: string; count?: number }
  | { type: "SetFlag"; flag: string; value: string }
  | { type: "ClearFlag"; flag: string }
  | { type: "KillNpc"; npcId: string }
  | { type: "DespawnWorldItem"; itemId: string }
  | { type: "OpenPortal"; zone: string; generator: string; placement?: PortalPlacement }
  /**
   * 정적 zone(Town/MountainVillage/SeasideHarbor/Forest/Dungeon(N)) 으로 가는
   * portal 을 현재 zone 에 즉시 스폰한다. Named 등록 없이 ZoneId enum 변형을 그대로 쓴다.
   * 시작 마을(Town) 에서 다른 마을로 가는 보상 portal 등에 사용. 기본 placement: Border.
   */
  | { type: "OpenZonePortal"; target: SpawnZone; placement?: PortalPlacement }
  | { type: "ClosePortal"; zone: string }
  /**
   * 가드 스폰. `zone` 지정 시 — 그 zone 진입 시점까지 deferred 큐에 보류했다가
   * 그때 스폰. 미지정(undefined) 시 — 현재 맵에 즉시 스폰(legacy 동작).
   * 잠입 퀘스트가 마을에서 수락돼도 가드가 마을에 깔리지 않도록 명시 권장.
   */
  | { type: "SpawnGuards"; count: number; zone?: SpawnZone }
  | { type: "PlaceTraps"; kind: TrapKind; count: number; hidden: boolean; zone?: SpawnZone }
  | { type: "Explode"; radius: number; terrain: boolean; entityDamage: number }
  | { type: "SpawnMonster"; monsterId: string; count: number; zone?: SpawnZone }
  /**
   * 플레이어를 지정 NPC 의 home_landmark 위치로 텔레포트한다.
   * 게임 `QuestAction::TeleportToNpcHome { npc_id }` 미러. 잠입 실패 시 장로 집으로
   * 강제 복귀 같은 흐름에 사용.
   */
  | { type: "TeleportToNpcHome"; npcId: string };

// ── 상태 전환 ─────────────────────────────────────────────────────────────

/**
 * 상태 전이의 트리거 종류.
 * - `Interact` — NPC 마지막 대사 이후 플레이어가 상호작용했을 때.
 * - `Auto`     — 매 프레임 조건 자동 평가.
 * - `EnterNpcFov` — 플레이어가 지정 NPC 의 시야 안에 들어옴 (잠입 퀘스트의 vendor 발각 등).
 *                  `triggerNpcId` 가 그 NPC 의 id.
 * - `HoldingItemInNpcFov` — 위 + 지정 아이템 인벤토리 보유 동시 조건.
 *                          `triggerNpcId` + `triggerItemId` 가 필요.
 *
 * 게임 `quest::TriggerKind` enum 미러. variant 추가 시 ron.ts 의 parser/serializer 도 함께 갱신.
 *
 * NOTE: 호환성을 위해 string union 으로 유지. EnterNpcFov / HoldingItemInNpcFov 의
 * 인스턴스 매개변수(npc_id / item_id)는 `QuestTransition` 의 `triggerNpcId`
 * / `triggerItemId` 필드로 전달한다.
 */
export type TriggerKind =
  | "Interact"
  | "Auto"
  | "EnterNpcFov"
  | "HoldingItemInNpcFov";

/**
 * 순서형 상태 전환 규칙. 같은 (from, trigger) 그룹에서 RON 목록 순서대로
 * 평가하여 첫 번째 매칭(when 충족)만 실행한다. `to === from` 이면 같은 phase
 * 에 머문다 (Log 전용 등).
 */
export interface QuestTransition {
  from: string;
  trigger: TriggerKind;
  /**
   * `EnterNpcFov` / `HoldingItemInNpcFov` 트리거의 NPC id.
   * 다른 trigger 종류에선 무시되며 RON 직렬화에도 포함되지 않는다.
   */
  triggerNpcId?: string;
  /**
   * `HoldingItemInNpcFov` 트리거의 item id.
   * 다른 trigger 종류에선 무시.
   */
  triggerItemId?: string;
  /** 없으면 항상 매칭 (unconditional) */
  when?: Condition;
  /** Auto / FOV trigger 는 DespawnWorldItem / RemoveItem / RemoveItems / SetFlag / Log / TeleportToNpcHome 만 허용 */
  actions: Action[];
  to: string;
}

// ── 스폰 존 ───────────────────────────────────────────────────────────────
//
// 단순화: 게임의 `ZoneId` 가 `Town | Named(String)` 로 통일됐다.
// 표준 Named id: "forest", "dungeon_<N>", "mountain_village", "seaside_harbor".
// 옛 RON 의 bare ident(`Forest`/`MountainVillage`/`SeasideHarbor`) 와 paren
// 형식(`Dungeon(N)`) 도 파서가 자동으로 Named 로 흡수한다.

export type SpawnZone =
  | { type: "Town" }
  | { type: "Named"; id: string };

export interface QuestSpawn {
  phase: string;
  item: string;
  zone: SpawnZone;
  count?: number;
  condition?: Condition;
  /**
   * Town zone 안에서 *특정 landmark 영역* 안으로 스폰 위치를 좁힌다.
   * 예: `landmark: "market"` 이면 시장 안 floor 타일에만 spawn.
   * 게임 `QuestSpawn.landmark: Option<HomeLandmark>` 미러. 누락은 None (기존 동작 — zone 의 임의 방).
   *
   * `landmark_tiles` 는 prefab carve 시점에 *내부* (외벽+1) Floor 좌표만 기록되므로
   * "상점 내부" 가 자연히 보장된다 (외벽 / 도로 옆은 제외).
   */
  landmark?: HomeLandmark;
  /**
   * vendor (`vendor: true` 인 NPC) 로부터 최소 manhattan 거리. landmark 안에서도
   * 이 거리 미만의 타일은 후보에서 제외 — vendor 카운터 옆 즉시 시야에 spawn 금지.
   *
   * `super_tintham_cracker` 처럼 vendor 가 *몰래 숨겨놓은* 아이템이 vendor 옆에
   * spawn 되면 곧바로 발각된다 → 어느 정도 떨어진 위치여야 회피 가능. `2` 면
   * 카운터로부터 2칸 떨어진 후보만 허용.
   *
   * 게임 `QuestSpawn.vendor_distance_min: Option<u32>` 미러. 누락은 None (필터 없음).
   */
  vendorDistanceMin?: number;
}

// ── 페이즈 ────────────────────────────────────────────────────────────────

export interface QuestPhaseDef {
  dialog: string[];
  objective: string | null;
  /** React Flow 캔버스 위치 (에디터 전용) */
  position?: { x: number; y: number };
}

// ── 퀘스트 ────────────────────────────────────────────────────────────────

export interface QuestDef {
  id: string;
  title: string;
  giverNpc: string;
  initialPhase: string;
  spawnChance?: number;
  phases: Record<string, QuestPhaseDef>;
  /** 순서형 상태 전환 규칙 목록 */
  transitions: QuestTransition[];
  spawns: QuestSpawn[];
}

// ── DB 문서 타입 ──────────────────────────────────────────────────────────

export interface QuestDocument extends QuestDef {
  _id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuestRevisionDocument {
  _id: string;
  questId: string;
  version: number;
  quest: QuestDef;
  createdAt: string;
}

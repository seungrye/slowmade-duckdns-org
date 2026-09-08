import type { HomeLandmark } from "./villager";

// -- the condition types ----------------------------------------------------

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

// -- portal placement -------------------------------------------------------

export type PortalPlacement =
  | { type: "InsideRoom" }
  | { type: "Border" }
  | { type: "Random" }
  | { type: "NearGiver"; radius: number };

// -- the action types -------------------------------------------------------

/** The trap kinds (mirroring bevy-rogue's trap::TrapKind). */
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
  | { type: "TeleportToNpcHome"; npcId: string }
  /**
   * 월드에 quest item 을 *런타임으로* spawn 한다. 기존 `QuestSpawn` 은 phase
   * 진입 + 맵 변경 시점에만 발동되므로 한 phase 안에서 재 spawn 이 불가.
   * `SpawnItem` 은 transition action 으로 호출되어 — 예) 잠입 실패 후 재시도
   * transition (failed → accepted) 에서 사라진 졸라크래커를 다시 깐다.
   *
   * 데이터-주도: 어떤 아이템·landmark·vendor 거리·count·zone 모두 인스턴스로 전달.
   * 코드에 어떤 item/위치도 박지 않는다 — 다른 quest 도 같은 mechanic 을 재사용.
   *
   * - `zone` undefined → 현재 zone 에 즉시 spawn (대부분의 retry 시나리오).
   * - `landmark` 지정 시 그 landmark 내부 floor 타일만 후보 (예: market).
   * - `vendorDistanceMin` 지정 시 vendor 카운터로부터 그 manhattan 거리 미만 타일 제외.
   * - `count` 미지정 시 1.
   *
   * 게임 `QuestAction::SpawnItem { item_id, zone, landmark, vendor_distance_min, count }` 미러.
   */
  | {
      type: "SpawnItem";
      itemId: string;
      zone?: SpawnZone;
      landmark?: HomeLandmark;
      vendorDistanceMin?: number;
      count?: number;
    };

// -- the state transitions --------------------------------------------------

/**
 * The kind of trigger for a state transition.
 * - `Interact` - when the player interacts after the NPC's last line.
 * - `Auto`     - the condition is evaluated automatically every frame.
 * - `EnterNpcFov` - the player enters the given NPC's field of view (a vendor spotting them in a stealth quest, for instance).
 *                  `triggerNpcId` is that NPC's id.
 * - `HoldingItemInNpcFov` - the above plus holding the given item in the inventory.
 *                          `triggerNpcId` and `triggerItemId` are required.
 *
 * Mirroring the game's `quest::TriggerKind` enum. Adding a variant means updating ron.ts's parser and serializer too.
 *
 * NOTE: kept as a string union for compatibility. EnterNpcFov's and HoldingItemInNpcFov's
 * instance parameters (npc_id / item_id) are passed through `QuestTransition`'s `triggerNpcId`
 * and `triggerItemId` fields.
 */
export type TriggerKind =
  | "Interact"
  | "Auto"
  | "EnterNpcFov"
  | "HoldingItemInNpcFov";

/**
 * An ordered state transition rule. Within the same (from, trigger) group they are evaluated in the RON list's
 * order and only the first match (whose when is met) runs. With `to === from` it stays in the same phase
 * (for a Log-only transition and so on).
 */
export interface QuestTransition {
  from: string;
  trigger: TriggerKind;
  /**
   * The NPC id for the `EnterNpcFov` / `HoldingItemInNpcFov` triggers.
   * Ignored on other trigger kinds and left out of the RON serialisation.
   */
  triggerNpcId?: string;
  /**
   * The item id for the `HoldingItemInNpcFov` trigger.
   * Ignored on other trigger kinds.
   */
  triggerItemId?: string;
  /** Absent, it always matches (unconditional) */
  when?: Condition;
  /** The Auto and FOV triggers allow only DespawnWorldItem / RemoveItem / RemoveItems / SetFlag / Log / TeleportToNpcHome */
  actions: Action[];
  to: string;
}

// -- the spawn zones --------------------------------------------------------
//
// Simplified: the game's `ZoneId` is unified as `Town | Named(String)`.
// The standard Named ids: "forest", "dungeon_<N>", "mountain_village", "seaside_harbor".
// The old RON's bare idents (`Forest`/`MountainVillage`/`SeasideHarbor`) and paren
// form (`Dungeon(N)`) are absorbed into Named by the parser automatically.

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
   * Narrows the spawn position to *a particular landmark's area* within the Town zone.
   * With `landmark: "market"`, for instance, it spawns only on floor tiles inside the market.
   * Mirroring the game's `QuestSpawn.landmark: Option<HomeLandmark>`. Absent means None (the previous behaviour - any room in the zone).
   *
   * `landmark_tiles` records only the *interior* (the outer wall plus 1) Floor coordinates at prefab carve time, so
   * "inside the shop" is guaranteed naturally (the outer wall and the roadside are excluded).
   */
  landmark?: HomeLandmark;
  /**
   * The minimum manhattan distance from a vendor (an NPC with `vendor: true`). Even inside the landmark,
   * tiles nearer than this are excluded - nothing spawns in immediate sight beside the vendor's counter.
   *
   * An item a vendor *hid away*, such as `super_tintham_cracker`, is spotted at once if it spawns beside
   * the vendor -> it has to be some distance off to be avoidable. With `2`, only candidates
   * 2 tiles from the counter are allowed.
   *
   * Mirroring the game's `QuestSpawn.vendor_distance_min: Option<u32>`. Absent means None (no filter).
   */
  vendorDistanceMin?: number;
}

// -- the phases -------------------------------------------------------------

export interface QuestPhaseDef {
  dialog: string[];
  objective: string | null;
  /** The React Flow canvas position (editor only) */
  position?: { x: number; y: number };
}

// -- the quest --------------------------------------------------------------

export interface QuestDef {
  id: string;
  title: string;
  giverNpc: string;
  initialPhase: string;
  spawnChance?: number;
  phases: Record<string, QuestPhaseDef>;
  /** The list of ordered state transition rules */
  transitions: QuestTransition[];
  spawns: QuestSpawn[];
}

// -- the DB document types --------------------------------------------------

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

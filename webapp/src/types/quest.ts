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
  | { type: "SetFlag"; flag: string; value: string }
  | { type: "ClearFlag"; flag: string }
  | { type: "KillNpc"; npcId: string }
  | { type: "DespawnWorldItem"; itemId: string }
  | { type: "OpenPortal"; zone: string; generator: string; placement?: PortalPlacement }
  | { type: "ClosePortal"; zone: string }
  /**
   * 가드 스폰. `zone` 지정 시 — 그 zone 진입 시점까지 deferred 큐에 보류했다가
   * 그때 스폰. 미지정(undefined) 시 — 현재 맵에 즉시 스폰(legacy 동작).
   * 잠입 퀘스트가 마을에서 수락돼도 가드가 마을에 깔리지 않도록 명시 권장.
   */
  | { type: "SpawnGuards"; count: number; zone?: SpawnZone }
  | { type: "PlaceTraps"; kind: TrapKind; count: number; hidden: boolean; zone?: SpawnZone }
  | { type: "Explode"; radius: number; terrain: boolean; entityDamage: number }
  | { type: "SpawnMonster"; monsterId: string; count: number; zone?: SpawnZone };

// ── 상태 전환 ─────────────────────────────────────────────────────────────

/** NPC 상호작용(Interact) 또는 매 프레임 자동 조건(Auto) 트리거. */
export type TriggerKind = "Interact" | "Auto";

/**
 * 순서형 상태 전환 규칙. 같은 (from, trigger) 그룹에서 RON 목록 순서대로
 * 평가하여 첫 번째 매칭(when 충족)만 실행한다. `to === from` 이면 같은 phase
 * 에 머문다 (Log 전용 등).
 */
export interface QuestTransition {
  from: string;
  trigger: TriggerKind;
  /** 없으면 항상 매칭 (unconditional) */
  when?: Condition;
  /** Auto trigger 는 DespawnWorldItem/RemoveItem/SetFlag 만 허용 */
  actions: Action[];
  to: string;
}

// ── 스폰 존 ───────────────────────────────────────────────────────────────

export type SpawnZone =
  | { type: "Town" }
  | { type: "Forest" }
  | { type: "Dungeon"; level: number }
  | { type: "Named"; id: string };

export interface QuestSpawn {
  phase: string;
  item: string;
  zone: SpawnZone;
  count?: number;
  condition?: Condition;
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

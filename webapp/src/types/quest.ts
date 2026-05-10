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

export type Action =
  | { type: "AdvancePhase"; phaseId: string }
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
  | { type: "Branch"; condition: Condition; ifTrue: Action[]; ifFalse: Action[] };

// ── 자동 전진 ─────────────────────────────────────────────────────────────

export interface AutoAdvance {
  condition: Condition;
  nextPhase: string;
  actions?: Action[];
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
  on_interact: Action[];
  auto_advance: AutoAdvance[];
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

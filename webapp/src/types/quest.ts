// ── 조건 타입 ──────────────────────────────────────────────────────────────

export type Condition =
  | { type: "FlagIs"; flag: string; value: string }
  | { type: "HasItem"; itemId: string }
  | { type: "Always" };

// ── 액션 타입 ─────────────────────────────────────────────────────────────

export type Action =
  | { type: "AdvancePhase"; phaseId: string }
  | { type: "Log"; text: string }
  | { type: "GiveItem"; itemId: string }
  | { type: "SetFlag"; flag: string; value: string }
  | { type: "KillNpc"; npcId: string }
  | { type: "Branch"; branches: { condition: Condition; phaseId: string }[] };

// ── 자동 전진 ─────────────────────────────────────────────────────────────

export interface AutoAdvance {
  condition: Condition;
  nextPhase: string;
}

// ── 스폰 존 ───────────────────────────────────────────────────────────────

export type SpawnZone =
  | { type: "Dungeon"; level: number }
  | { type: "World"; mapId: string };

export interface QuestSpawn {
  phase: string;
  item: string;
  zone: SpawnZone;
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

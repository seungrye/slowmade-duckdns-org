import type { Action, Condition, QuestDef, QuestSpawn, QuestTransition } from "@/types/quest";

// ── 구조적 검증 (Rust validate_quest_def 와 동일 기준) ───────────────────────

export interface QuestStructError {
  path: string;
  message: string;
}

const ALLOWED_AUTO_ACTIONS = new Set(["DespawnWorldItem", "RemoveItem", "SetFlag"]);

export function validateQuestStructure(quest: QuestDef): QuestStructError[] {
  const out: QuestStructError[] = [];
  const phaseKeys = new Set(Object.keys(quest.phases ?? {}));

  if (quest.initialPhase && !phaseKeys.has(quest.initialPhase)) {
    out.push({ path: "initialPhase", message: `initialPhase "${quest.initialPhase}" 이 phases 에 없습니다` });
  }

  if (quest.spawnChance !== undefined) {
    if (typeof quest.spawnChance !== "number" || quest.spawnChance < 0 || quest.spawnChance > 1) {
      out.push({
        path: "spawnChance",
        message: `spawnChance ${quest.spawnChance} 는 0.0~1.0 범위여야 합니다`,
      });
    }
  }

  (quest.transitions ?? []).forEach((t, i) => {
    const base = `transitions[${i}]`;
    if (t.from && !phaseKeys.has(t.from)) {
      out.push({ path: `${base}.from`, message: `transition from "${t.from}" 이 phases 에 없습니다` });
    }
    if (t.to && !phaseKeys.has(t.to)) {
      out.push({ path: `${base}.to`, message: `transition to "${t.to}" 이 phases 에 없습니다` });
    }
    if (t.trigger === "Auto") {
      (t.actions ?? []).forEach((a, j) => {
        if (!ALLOWED_AUTO_ACTIONS.has(a.type)) {
          out.push({ path: `${base}.actions[${j}]`, message: `Auto transition 에서 "${a.type}" 은 지원하지 않습니다 (DespawnWorldItem / RemoveItem / SetFlag 만 가능)` });
        }
      });
    }
  });

  (quest.spawns ?? []).forEach((s, i) => {
    if (s.phase && !phaseKeys.has(s.phase)) {
      out.push({ path: `spawns[${i}].phase`, message: `spawn phase "${s.phase}" 이 phases 에 없습니다` });
    }
  });

  return out;
}

export interface QuestRefWarning {
  path: string;
  kind: "villager" | "item" | "zone";
  missing: string;
}

export interface CatalogSets {
  villagers: Set<string>;
  items: Set<string>;
  zones: Set<string>;
}

export function validateQuestRefs(quest: QuestDef, catalogs: CatalogSets): QuestRefWarning[] {
  const out: QuestRefWarning[] = [];

  if (quest.giverNpc && !catalogs.villagers.has(quest.giverNpc)) {
    out.push({ path: "giverNpc", kind: "villager", missing: quest.giverNpc });
  }

  const transitions = quest.transitions ?? [];
  for (let i = 0; i < transitions.length; i++) {
    validateTransition(transitions[i], `transitions[${i}]`, catalogs, out);
  }

  const spawns = quest.spawns ?? [];
  for (let i = 0; i < spawns.length; i++) {
    validateSpawn(spawns[i], `spawns[${i}]`, catalogs, out);
  }

  return out;
}

function validateTransition(t: QuestTransition, basePath: string, c: CatalogSets, out: QuestRefWarning[]) {
  if (t.when) {
    validateCondition(t.when, `${basePath}.when`, c, out);
  }
  const actions = t.actions ?? [];
  for (let i = 0; i < actions.length; i++) {
    validateAction(actions[i], `${basePath}.actions[${i}]`, c, out);
  }
}

function validateAction(a: Action, path: string, c: CatalogSets, out: QuestRefWarning[]) {
  switch (a.type) {
    case "GiveItem":
    case "GiveItems":
    case "RemoveItem":
    case "DespawnWorldItem":
      if (a.itemId && !c.items.has(a.itemId)) {
        out.push({ path: `${path}.itemId`, kind: "item", missing: a.itemId });
      }
      break;
    case "KillNpc":
      if (a.npcId && !c.villagers.has(a.npcId)) {
        out.push({ path: `${path}.npcId`, kind: "villager", missing: a.npcId });
      }
      break;
    case "OpenPortal":
    case "ClosePortal":
      if (a.zone && !c.zones.has(a.zone)) {
        out.push({ path: `${path}.zone`, kind: "zone", missing: a.zone });
      }
      break;
    case "SpawnGuards":
    case "PlaceTraps":
    case "SpawnMonster":
      // optional Named zone — 지정된 경우에만 카탈로그 존재 검사
      if (a.zone && a.zone.type === "Named" && a.zone.id && !c.zones.has(a.zone.id)) {
        out.push({ path: `${path}.zone.id`, kind: "zone", missing: a.zone.id });
      }
      break;
    // Log, SetFlag, ClearFlag, Explode — 검증 대상 없음
  }
}

function validateCondition(cond: Condition, path: string, c: CatalogSets, out: QuestRefWarning[]) {
  switch (cond.type) {
    case "HasItem":
      if (cond.itemId && !c.items.has(cond.itemId)) {
        out.push({ path: `${path}.itemId`, kind: "item", missing: cond.itemId });
      }
      break;
    case "InZone":
      if (cond.zone.type === "Named" && cond.zone.id && !c.zones.has(cond.zone.id)) {
        out.push({ path: `${path}.zone.id`, kind: "zone", missing: cond.zone.id });
      }
      break;
    case "And":
    case "Or":
      for (let i = 0; i < cond.conditions.length; i++) {
        validateCondition(cond.conditions[i], `${path}.conditions[${i}]`, c, out);
      }
      break;
    case "Not":
      validateCondition(cond.condition, `${path}.condition`, c, out);
      break;
    // Always, FlagIs, HasFlag — 검증 대상 없음
    // PhaseIs — quests 컬렉션 참조이므로 현 사이클에서는 제외
  }
}

function validateSpawn(spawn: QuestSpawn, path: string, c: CatalogSets, out: QuestRefWarning[]) {
  if (spawn.item && !c.items.has(spawn.item)) {
    out.push({ path: `${path}.item`, kind: "item", missing: spawn.item });
  }
  if (spawn.zone.type === "Named" && spawn.zone.id && !c.zones.has(spawn.zone.id)) {
    out.push({ path: `${path}.zone.id`, kind: "zone", missing: spawn.zone.id });
  }
  if (spawn.condition) {
    validateCondition(spawn.condition, `${path}.condition`, c, out);
  }
}

import type { Action, Condition, QuestDef, QuestPhaseDef, QuestSpawn } from "@/types/quest";

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

  for (const [phaseId, phase] of Object.entries(quest.phases)) {
    validatePhase(phase, `phases.${phaseId}`, catalogs, out);
  }

  const spawns = quest.spawns ?? [];
  for (let i = 0; i < spawns.length; i++) {
    validateSpawn(spawns[i], `spawns[${i}]`, catalogs, out);
  }

  return out;
}

function validatePhase(phase: QuestPhaseDef, basePath: string, c: CatalogSets, out: QuestRefWarning[]) {
  const onInteract = phase.on_interact ?? [];
  for (let i = 0; i < onInteract.length; i++) {
    validateAction(onInteract[i], `${basePath}.on_interact[${i}]`, c, out);
  }
  const autoAdvance = phase.auto_advance ?? [];
  for (let i = 0; i < autoAdvance.length; i++) {
    const aa = autoAdvance[i];
    if (aa.condition) {
      validateCondition(aa.condition, `${basePath}.auto_advance[${i}].condition`, c, out);
    }
    if (aa.actions) {
      for (let j = 0; j < aa.actions.length; j++) {
        validateAction(aa.actions[j], `${basePath}.auto_advance[${i}].actions[${j}]`, c, out);
      }
    }
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
    case "Branch":
      validateCondition(a.condition, `${path}.condition`, c, out);
      for (let i = 0; i < a.ifTrue.length; i++) {
        validateAction(a.ifTrue[i], `${path}.if_true[${i}]`, c, out);
      }
      for (let i = 0; i < a.ifFalse.length; i++) {
        validateAction(a.ifFalse[i], `${path}.if_false[${i}]`, c, out);
      }
      break;
    // AdvancePhase, Log, SetFlag, ClearFlag — 검증 대상 없음
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

import type { Action, Condition, QuestSpawn, QuestTransition } from "@/types/quest";

export interface OpenPortalRef {
  zone: string;
  generator: string;
}

export function collectOpenPortals(actions: Action[], out: OpenPortalRef[] = []): OpenPortalRef[] {
  for (const a of actions) {
    if (a.type === "OpenPortal") {
      out.push({ zone: a.zone, generator: a.generator });
    }
  }
  return out;
}

export interface QuestLike {
  transitions?: QuestTransition[];
  spawns?: QuestSpawn[];
}

export function collectFromQuest(quest: QuestLike): OpenPortalRef[] {
  const out: OpenPortalRef[] = [];
  for (const t of quest.transitions ?? []) {
    collectOpenPortals(t.actions ?? [], out);
  }
  return out;
}

// ── Collecting Named SpawnZones (for auto-registration) ───────────────────────────────────────
//
// It gathers Named ids from everywhere - SpawnGuards / PlaceTraps / SpawnMonster's `zone: Some(Named("…"))`,
// a condition's InZone(Named), the Named in spawns[i].zone and so on. OpenPortal/ClosePortal's zone
// (a plain string) is included too, and they are upserted into the Zone catalogue when
// the quest is saved.

function collectNamedFromCondition(cond: Condition, out: Set<string>) {
  switch (cond.type) {
    case "InZone":
      if (cond.zone.type === "Named" && cond.zone.id) out.add(cond.zone.id);
      break;
    case "And":
    case "Or":
      for (const c of cond.conditions) collectNamedFromCondition(c, out);
      break;
    case "Not":
      collectNamedFromCondition(cond.condition, out);
      break;
  }
}

function collectNamedFromAction(a: Action, out: Set<string>) {
  switch (a.type) {
    case "OpenPortal":
    case "ClosePortal":
      if (a.zone) out.add(a.zone);
      break;
    case "OpenZonePortal":
      // Town is not registered in the catalogue (it is the code's starting zone). Only Named ids are.
      if (a.target.type === "Named" && a.target.id) out.add(a.target.id);
      break;
    case "SpawnGuards":
    case "PlaceTraps":
    case "SpawnMonster":
      if (a.zone && a.zone.type === "Named" && a.zone.id) out.add(a.zone.id);
      break;
  }
}

export function collectNamedZones(quest: QuestLike): string[] {
  const set = new Set<string>();
  for (const t of quest.transitions ?? []) {
    if (t.when) collectNamedFromCondition(t.when, set);
    for (const a of t.actions ?? []) collectNamedFromAction(a, set);
  }
  for (const s of quest.spawns ?? []) {
    if (s.zone.type === "Named" && s.zone.id) set.add(s.zone.id);
    if (s.condition) collectNamedFromCondition(s.condition, set);
  }
  return Array.from(set);
}

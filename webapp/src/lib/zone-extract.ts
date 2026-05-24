import type { Action, QuestTransition } from "@/types/quest";

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
}

export function collectFromQuest(quest: QuestLike): OpenPortalRef[] {
  const out: OpenPortalRef[] = [];
  for (const t of quest.transitions ?? []) {
    collectOpenPortals(t.actions ?? [], out);
  }
  return out;
}

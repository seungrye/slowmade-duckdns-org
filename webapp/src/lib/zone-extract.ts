import type { Action, QuestPhaseDef } from "@/types/quest";

export interface OpenPortalRef {
  zone: string;
  generator: string;
}

export function collectOpenPortals(actions: Action[], out: OpenPortalRef[] = []): OpenPortalRef[] {
  for (const a of actions) {
    if (a.type === "OpenPortal") {
      out.push({ zone: a.zone, generator: a.generator });
    } else if (a.type === "Branch") {
      collectOpenPortals(a.ifTrue, out);
      collectOpenPortals(a.ifFalse, out);
    }
  }
  return out;
}

export function collectFromPhase(phase: QuestPhaseDef): OpenPortalRef[] {
  const out: OpenPortalRef[] = [];
  collectOpenPortals(phase.on_interact ?? [], out);
  for (const aa of phase.auto_advance ?? []) {
    collectOpenPortals(aa.actions ?? [], out);
  }
  return out;
}

export interface QuestLike {
  phases: Map<string, QuestPhaseDef> | Record<string, QuestPhaseDef>;
}

export function collectFromQuest(quest: QuestLike): OpenPortalRef[] {
  const phases = quest.phases instanceof Map
    ? Object.fromEntries(quest.phases)
    : quest.phases ?? {};
  const out: OpenPortalRef[] = [];
  for (const phase of Object.values(phases) as QuestPhaseDef[]) {
    out.push(...collectFromPhase(phase));
  }
  return out;
}

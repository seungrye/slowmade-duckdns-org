import { connectToDB } from "@/lib/db";
import { apiSuccess } from "@/lib/api-response";
import Quest from "@/models/quest";
import Zone from "@/models/zone";
import type { Action, QuestPhaseDef } from "@/types/quest";

interface OpenPortalRef { zone: string; generator: string }

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

interface QuestLike {
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

interface ExtractSummary {
  created: number;
  skipped: number;
  conflicts: Array<{ name: string; catalogGenerator: string; foundGenerator: string }>;
}

export async function POST() {
  await connectToDB();

  const quests = await Quest.find({}).lean();
  const portals: OpenPortalRef[] = [];
  for (const q of quests) {
    portals.push(...collectFromQuest(q as unknown as QuestLike));
  }

  // (zone, generator) 쌍 dedup
  const uniq = new Map<string, OpenPortalRef>();
  for (const p of portals) {
    const key = `${p.zone}::${p.generator}`;
    if (!uniq.has(key)) uniq.set(key, p);
  }

  const summary: ExtractSummary = { created: 0, skipped: 0, conflicts: [] };

  for (const ref of uniq.values()) {
    const existing = await Zone.findOne({ name: ref.zone });
    if (!existing) {
      await Zone.create({
        name: ref.zone,
        generator: ref.generator,
        description: "",
      });
      summary.created++;
      continue;
    }
    if (existing.generator === ref.generator) {
      summary.skipped++;
    } else {
      summary.conflicts.push({
        name: ref.zone,
        catalogGenerator: existing.generator,
        foundGenerator: ref.generator,
      });
    }
  }

  return apiSuccess(summary);
}

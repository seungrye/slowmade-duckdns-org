import { connectToDB } from "@/lib/db";
import { apiSuccess } from "@/lib/api-response";
import Quest from "@/models/quest";
import Zone from "@/models/zone";
import { collectFromQuest, type OpenPortalRef, type QuestLike } from "@/lib/zone-extract";

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

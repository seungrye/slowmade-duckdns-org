import { connectToDB } from "@/lib/db";
import Monster from "@/models/monster";
import { serializeMonstersRon } from "@/lib/ron";
import type { MonsterDef, MonsterElement } from "@/types/monster";

export async function GET() {
  await connectToDB();
  const docs = await Monster.find({}).sort({ id: 1 }).lean();

  const monsters: MonsterDef[] = docs.map((d) => {
    const m: MonsterDef = {
      id: d.id,
      displayName: d.displayName,
      glyph: d.glyph,
      color: [d.color[0], d.color[1], d.color[2]],
      hp: d.hp,
      attack: d.attack,
      defense: d.defense,
      visionRadius: d.visionRadius,
      speed: typeof d.speed === "number" ? d.speed : 1.0,
      element: (d.element ?? null) as MonsterElement | null,
      spawnWeight: typeof d.spawnWeight === "number" ? d.spawnWeight : 1.0,
      zones: d.zones ?? [],
      questOnly: !!d.questOnly,
    };
    if (d.spawnCondition != null) m.spawnCondition = d.spawnCondition;
    return m;
  });

  const ron = serializeMonstersRon(monsters);
  return new Response(ron, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="monsters.ron"`,
    },
  });
}

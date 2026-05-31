import { connectToDB } from "@/lib/db";
import Villager from "@/models/villager";
import { serializeVillagersRon } from "@/lib/ron";
import type { VillagerDef } from "@/types/villager";

export async function GET() {
  await connectToDB();
  const docs = await Villager.find({}).sort({ id: 1 }).lean();

  const villagers: VillagerDef[] = docs.map((d) => {
    const v: VillagerDef = {
      id: d.id,
      name: d.name,
      color: [d.color[0], d.color[1], d.color[2]],
      dialogs: d.dialogs ?? [],
      speed: typeof d.speed === "number" ? d.speed : 1.0,
    };
    if (d.stationary) v.stationary = true;
    if (d.vendor) v.vendor = true;
    // homeZone/homeLandmark — serializer 가 기본값(Town / random) 은 자동 생략.
    if (d.homeZone) v.homeZone = d.homeZone as VillagerDef["homeZone"];
    if (d.homeLandmark) v.homeLandmark = d.homeLandmark as VillagerDef["homeLandmark"];
    return v;
  });

  const ron = serializeVillagersRon(villagers);
  return new Response(ron, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="villagers.ron"`,
    },
  });
}

import Villager from "@/models/villager";
import Item from "@/models/item";
import Zone from "@/models/zone";
import type { CatalogSets } from "./quest-validation";

export async function loadCatalogSets(): Promise<CatalogSets> {
  const [villagers, items, zones] = await Promise.all([
    Villager.find({}).select("id").lean(),
    Item.find({}).select("id").lean(),
    Zone.find({}).select("name").lean(),
  ]);
  return {
    // 퀘스트 giver_npc / KillNpc 는 villager id 를 참조
    villagers: new Set((villagers as Array<{ id: string }>).map((v) => v.id)),
    items: new Set((items as Array<{ id: string }>).map((i) => i.id)),
    zones: new Set(zones.map((z) => z.name)),
  };
}

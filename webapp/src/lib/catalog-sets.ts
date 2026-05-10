import Villager from "@/models/villager";
import Item from "@/models/item";
import Zone from "@/models/zone";
import type { CatalogSets } from "./quest-validation";

export async function loadCatalogSets(): Promise<CatalogSets> {
  const [villagers, items, zones] = await Promise.all([
    Villager.find({}).select("name").lean(),
    Item.find({}).select("id").lean(),
    Zone.find({}).select("name").lean(),
  ]);
  return {
    villagers: new Set(villagers.map((v) => v.name)),
    items: new Set((items as Array<{ id: string }>).map((i) => i.id)),
    zones: new Set(zones.map((z) => z.name)),
  };
}

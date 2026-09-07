// The public read-only API for the game's live content sync.
// The wasm game fetches it at startup to use the latest DB content.
//
// The response schema (version: 1):
//   { version, generated_at, quests: [{id, ron}], items: {<file>: ron}, villagers: ron, monsters: ron }
//
// - Serialisation reuses only the existing functions in src/lib/ron.ts (round-trip verified against the game's RON).
// - Only StartLoadout has no DB schema yet, so it returns a RON constant identical to the game's default.
// - No authentication (public data: the quest, item, villager and monster catalogues).
//
// Caching: 1 minute (an edit reaches the game within a minute). CORS: unnecessary while same-origin, but the wasm
// might be hosted on another domain, so * is allowed explicitly.

import { connectToDB } from "@/lib/db";
import Quest from "@/models/quest";
import Item from "@/models/item";
import Villager from "@/models/villager";
import Monster from "@/models/monster";
import StartLoadout from "@/models/start-loadout";
import TownConfig from "@/models/town-config";
import {
  serializeRon,
  serializeQuestItemsRon,
  serializeWeaponsRon,
  serializeArmorsRon,
  serializeConsumablesRon,
  serializeAccessoriesRon,
  serializeVillagersRon,
  serializeMonstersRon,
  serializeStartLoadoutRon,
  serializeTownConfigRon,
} from "@/lib/ron";
import type { QuestDef } from "@/types/quest";
import type { ItemDef, WeaponElement, AccessoryEffect } from "@/types/item";
import { ACCESSORY_EFFECTS } from "@/types/item";
import type { VillagerDef } from "@/types/villager";
import type { MonsterDef, MonsterElement } from "@/types/monster";
import type { StartLoadoutDef } from "@/types/start-loadout";
import {
  TOWN_CONFIG_DEFAULTS, TOWN_SIZES, TOWN_ALGORITHMS, TOWN_ROADS, TOWN_WEALTHS, TOWN_DEFENSES, TOWN_LANDMARKS,
  TOWN_ENVIRONMENTS,
  type TownConfig as TownConfigDef,
  type TownSize, type TownAlgorithm, type TownRoads, type TownWealth, type TownDefenses, type TownLandmark,
  type TownEnvironment,
} from "@/types/town-config";

export const dynamic = "force-dynamic";

// ── The response schema ──────────────────────────────────────────────────────────────
// The same shape (keys and types) as the game's parser. A change requires bumping version and updating the game at the same time.
// v2: the town_config key added (the generation options RON for the starting town, ZoneId::Town).
const SCHEMA_VERSION = 2;

interface ContentResponse {
  version: number;
  generated_at: string;
  quests: { id: string; ron: string }[];
  items: {
    "quest_items.ron": string;
    "weapons.ron": string;
    "armors.ron": string;
    "consumables.ron": string;
    "accessories.ron": string;
    "start_loadout.ron": string;
  };
  villagers: string;
  monsters: string;
  /** The starting town's generation options RON. The game passes them to the generator on entering ZoneId::Town. */
  town_config: string;
}

// ── Mapping DB documents to domain types ────────────────────────────────────────────────

function toQuestDef(doc: Record<string, unknown>): QuestDef {
  const rawPhases = doc.phases;
  const phases: QuestDef["phases"] = (
    rawPhases instanceof Map
      ? Object.fromEntries(rawPhases)
      : ((rawPhases as Record<string, unknown> | undefined) ?? {})
  ) as QuestDef["phases"];

  const def: QuestDef = {
    id: doc.id as string,
    title: doc.title as string,
    giverNpc: (doc.giverNpc as string) ?? "",
    initialPhase: (doc.initialPhase as string) ?? "dormant",
    phases,
    transitions: (doc.transitions as QuestDef["transitions"]) ?? [],
    spawns: (doc.spawns as QuestDef["spawns"]) ?? [],
  };
  if (doc.spawnChance !== undefined && doc.spawnChance !== null) {
    def.spawnChance = doc.spawnChance as number;
  }
  return def;
}

function toItemDef(d: Record<string, unknown>): ItemDef {
  const base = {
    id: d.id as string,
    displayName: d.displayName as string,
    glyphAscii: d.glyphAscii as string,
    glyphGameIcon: d.glyphGameIcon as string,
    pickupMessage: d.pickupMessage as string,
  };
  // The shop price fields (buyPrice/sellPrice) - shared by every kind. When absent the key itself is absent ->
  // buy_price/sell_price are not emitted in the RON response (mirroring the game's #[serde(default)] None).
  // A bad value (negative, non-numeric) is ignored as a safety net - the DB invariant may not guarantee it.
  function applyPrices<T extends { buyPrice?: number; sellPrice?: number }>(out: T): T {
    if (typeof d.buyPrice === "number" && Number.isFinite(d.buyPrice) && d.buyPrice >= 0) {
      out.buyPrice = d.buyPrice;
    }
    if (typeof d.sellPrice === "number" && Number.isFinite(d.sellPrice) && d.sellPrice >= 0) {
      out.sellPrice = d.sellPrice;
    }
    return out;
  }
  switch (d.kind) {
    case "quest":
      return applyPrices<Extract<ItemDef, { kind: "quest" }>>({
        kind: "quest", ...base, imagePath: (d.imagePath as string) ?? "",
      });
    case "weapon": {
      const w: Extract<ItemDef, { kind: "weapon" }> = {
        kind: "weapon", ...base,
        attackPower: (d.attackPower as number) ?? 0,
        element: (d.element as WeaponElement | null | undefined) ?? null,
      };
      if (typeof d.attackPowerMin === "number") w.attackPowerMin = d.attackPowerMin;
      if (typeof d.attackPowerMax === "number") w.attackPowerMax = d.attackPowerMax;
      if (typeof d.tier === "number") w.tier = d.tier;
      return applyPrices(w);
    }
    case "armor": {
      const a: Extract<ItemDef, { kind: "armor" }> = {
        kind: "armor", ...base, defenseBonus: (d.defenseBonus as number) ?? 0,
      };
      if (typeof d.defenseBonusMin === "number") a.defenseBonusMin = d.defenseBonusMin;
      if (typeof d.defenseBonusMax === "number") a.defenseBonusMax = d.defenseBonusMax;
      if (typeof d.tier === "number") a.tier = d.tier;
      return applyPrices(a);
    }
    case "consumable":
      return applyPrices<Extract<ItemDef, { kind: "consumable" }>>({
        kind: "consumable",
        ...base,
        effect: (d.effect as { type: "Heal"; amount: number }) ?? { type: "Heal", amount: 0 },
      });
    case "accessory": {
      const a: Extract<ItemDef, { kind: "accessory" }> = {
        kind: "accessory",
        ...base,
        desc: (d.desc as string) ?? "",
      };
      // Only effects present in the DB with valid keys are kept in the response.
      // Validation happens at write time, but filtering once more at serialisation is a safety net.
      const raw = d.effects;
      if (Array.isArray(raw)) {
        const filtered = raw.filter(
          (e): e is AccessoryEffect =>
            typeof e === "string" && ACCESSORY_EFFECTS.includes(e as AccessoryEffect),
        );
        a.effects = filtered;
      }
      return applyPrices(a);
    }
    default:
      throw new Error(`Unknown item kind: ${String(d.kind)}`);
  }
}

function toVillagerDef(d: Record<string, unknown>): VillagerDef {
  const color = d.color as number[];
  const v: VillagerDef = {
    id: d.id as string,
    name: d.name as string,
    color: [color[0], color[1], color[2]],
    dialogs: (d.dialogs as string[]) ?? [],
    speed: typeof d.speed === "number" ? d.speed : 1.0,
  };
  if (d.stationary) v.stationary = true;
  if (d.vendor) v.vendor = true;
  // homeZone - the Mongoose subdoc passes through as is (the serializer omits the Town default automatically).
  if (d.homeZone) v.homeZone = d.homeZone as VillagerDef["homeZone"];
  // homeLandmark - the schema's default is "random". The serializer omits the default.
  if (d.homeLandmark) v.homeLandmark = d.homeLandmark as VillagerDef["homeLandmark"];
  // freeRoam - the schema's default is false. Only true is emitted in the RON (the serializer omits the default).
  if (d.freeRoam) v.freeRoam = true;
  // vendorVisionRadius - Option<u32>. null/undefined uses the game's fallback default (6).
  //   When given, only that vendor uses that radius (market_owner = 2, say). The serializer emits Some(N).
  //   Without this mapping the mongo value never reaches the RON response and the game runs on the fallback forever.
  if (typeof d.vendorVisionRadius === "number") v.vendorVisionRadius = d.vendorVisionRadius;
  // vendorInventory - Option<Vec<String>>. It distinguishes an explicitly empty shop ([]) from the SHOP_CATALOG
  // fallback (undefined). Branching on Array.isArray alone preserves the empty array.
  // Only valid ids are kept (stringified) - a safety net against bad DB values.
  if (Array.isArray(d.vendorInventory)) {
    v.vendorInventory = d.vendorInventory.filter((x): x is string => typeof x === "string");
  }
  return v;
}

function toMonsterDef(d: Record<string, unknown>): MonsterDef {
  const color = d.color as number[];
  const m: MonsterDef = {
    id: d.id as string,
    displayName: d.displayName as string,
    glyph: d.glyph as string,
    color: [color[0], color[1], color[2]],
    hp: d.hp as number,
    attack: d.attack as number,
    defense: d.defense as number,
    visionRadius: d.visionRadius as number,
    speed: typeof d.speed === "number" ? d.speed : 1.0,
    element: ((d.element as MonsterElement | null | undefined) ?? null),
    spawnWeight: typeof d.spawnWeight === "number" ? d.spawnWeight : 1.0,
    zones: (d.zones as MonsterDef["zones"]) ?? [],
    questOnly: !!d.questOnly,
  };
  if (d.spawnCondition != null) m.spawnCondition = d.spawnCondition as MonsterDef["spawnCondition"];
  return m;
}

// ── The StartLoadout default ────────────────────────────────────────────────────────
// The fallback when there is no doc in the DB - mirroring the game's read_start_loadout() default (gold 50).
const DEFAULT_START_LOADOUT: StartLoadoutDef = {
  gold: 50,
  weapon: null,
  armor: null,
  items: [],
  consumables: [],
};

function toStartLoadoutDef(d: Record<string, unknown>): StartLoadoutDef {
  const consumablesRaw = (d.consumables as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    gold: typeof d.gold === "number" ? d.gold : 0,
    weapon: (d.weapon as string | null | undefined) ?? null,
    armor: (d.armor as string | null | undefined) ?? null,
    items: (d.items as string[] | undefined) ?? [],
    consumables: consumablesRaw.map((c) => ({
      id: c.id as string,
      count: c.count as number,
    })),
  };
}

// ── The TownConfig fallback ────────────────────────────────────────────────────────────
// Unknown or missing values in the DB doc are replaced by the defaults - compatible when a new option is added.
function toTownConfigDef(d: Record<string, unknown>): TownConfigDef {
  const inEnum = <T extends string>(set: readonly T[], v: unknown, fallback: T): T =>
    (typeof v === "string" && (set as readonly string[]).includes(v)) ? (v as T) : fallback;
  const landmarksRaw = Array.isArray(d.landmarks) ? d.landmarks : [];
  const landmarks = landmarksRaw.filter(
    (v): v is TownLandmark => typeof v === "string" && (TOWN_LANDMARKS as readonly string[]).includes(v),
  );
  return {
    size: inEnum<TownSize>(TOWN_SIZES, d.size, TOWN_CONFIG_DEFAULTS.size),
    algorithm: inEnum<TownAlgorithm>(TOWN_ALGORITHMS, d.algorithm, TOWN_CONFIG_DEFAULTS.algorithm),
    roads: inEnum<TownRoads>(TOWN_ROADS, d.roads, TOWN_CONFIG_DEFAULTS.roads),
    wealth: inEnum<TownWealth>(TOWN_WEALTHS, d.wealth, TOWN_CONFIG_DEFAULTS.wealth),
    defenses: inEnum<TownDefenses>(TOWN_DEFENSES, d.defenses, TOWN_CONFIG_DEFAULTS.defenses),
    landmarks,
    fields: typeof d.fields === "boolean" ? d.fields : TOWN_CONFIG_DEFAULTS.fields,
    environment: inEnum<TownEnvironment>(TOWN_ENVIRONMENTS, d.environment, TOWN_CONFIG_DEFAULTS.environment),
  };
}

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET() {
  await connectToDB();

  const [questDocs, itemDocs, villagerDocs, monsterDocs, startLoadoutDoc, townConfigDoc] = await Promise.all([
    Quest.find({}).sort({ id: 1 }).lean() as unknown as Promise<Record<string, unknown>[]>,
    Item.find({}).sort({ id: 1 }).lean() as unknown as Promise<Record<string, unknown>[]>,
    Villager.find({}).sort({ id: 1 }).lean() as unknown as Promise<Record<string, unknown>[]>,
    Monster.find({}).sort({ id: 1 }).lean() as unknown as Promise<Record<string, unknown>[]>,
    StartLoadout.findById("default").lean() as unknown as Promise<Record<string, unknown> | null>,
    TownConfig.findById("default").lean() as unknown as Promise<Record<string, unknown> | null>,
  ]);

  const startLoadout = startLoadoutDoc ? toStartLoadoutDef(startLoadoutDoc) : DEFAULT_START_LOADOUT;
  const townConfig = townConfigDoc ? toTownConfigDef(townConfigDoc) : TOWN_CONFIG_DEFAULTS;

  const quests = questDocs
    .map(toQuestDef)
    .map((def) => ({ id: def.id, ron: serializeRon(def) }));

  const items = itemDocs.map(toItemDef);
  const questItems = items.filter((i): i is Extract<ItemDef, { kind: "quest" }> => i.kind === "quest");
  const weapons = items.filter((i): i is Extract<ItemDef, { kind: "weapon" }> => i.kind === "weapon");
  const armors = items.filter((i): i is Extract<ItemDef, { kind: "armor" }> => i.kind === "armor");
  const consumables = items.filter((i): i is Extract<ItemDef, { kind: "consumable" }> => i.kind === "consumable");
  const accessories = items.filter((i): i is Extract<ItemDef, { kind: "accessory" }> => i.kind === "accessory");

  const villagers = villagerDocs.map(toVillagerDef);
  const monsters = monsterDocs.map(toMonsterDef);

  const body: ContentResponse = {
    version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    quests,
    items: {
      "quest_items.ron": serializeQuestItemsRon(questItems),
      "weapons.ron": serializeWeaponsRon(weapons),
      "armors.ron": serializeArmorsRon(armors),
      "consumables.ron": serializeConsumablesRon(consumables),
      "accessories.ron": serializeAccessoriesRon(accessories),
      "start_loadout.ron": serializeStartLoadoutRon(startLoadout),
    },
    villagers: serializeVillagersRon(villagers),
    monsters: serializeMonstersRon(monsters),
    town_config: serializeTownConfigRon(townConfig),
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

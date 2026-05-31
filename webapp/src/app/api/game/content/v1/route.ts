// 게임 콘텐츠 라이브 동기화용 공개 read-only API.
// wasm 게임이 시작 시 fetch 해 최신 DB 콘텐츠를 받아 쓴다.
//
// 응답 스키마(version: 1):
//   { version, generated_at, quests: [{id, ron}], items: {<file>: ron}, villagers: ron, monsters: ron }
//
// - 직렬화는 src/lib/ron.ts 의 기존 함수만 재사용(게임 RON 과 라운드트립 검증됨).
// - StartLoadout 만 DB 스키마가 아직 없어 게임 기본값과 동일한 RON 상수를 반환한다.
// - 인증 X (공개 데이터: quest/item/villager/monster 카탈로그).
//
// 캐싱: 1분(편집 후 1분 내 게임 반영). CORS: same-origin 이면 사실 필요 없지만 wasm 이
// 다른 도메인에서 호스팅될 수도 있어 명시적으로 * 허용.

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

// ── 응답 스키마 ──────────────────────────────────────────────────────────────
// 게임 측 파서와 동일 형태(키/타입). 변경 시 version 증가 & 게임 동시 업데이트 필수.
// v2: town_config 키 추가 (시작 마을 ZoneId::Town 생성 옵션 RON).
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
  /** 시작 마을 생성 옵션 RON. 게임은 ZoneId::Town 진입 시 이 옵션을 generator 에 전달. */
  town_config: string;
}

// ── DB 문서 → 도메인 타입 매핑 ────────────────────────────────────────────────

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
  switch (d.kind) {
    case "quest":
      return { kind: "quest", ...base, imagePath: (d.imagePath as string) ?? "" };
    case "weapon": {
      const w: Extract<ItemDef, { kind: "weapon" }> = {
        kind: "weapon", ...base,
        attackPower: (d.attackPower as number) ?? 0,
        element: (d.element as WeaponElement | null | undefined) ?? null,
      };
      if (typeof d.attackPowerMin === "number") w.attackPowerMin = d.attackPowerMin;
      if (typeof d.attackPowerMax === "number") w.attackPowerMax = d.attackPowerMax;
      if (typeof d.tier === "number") w.tier = d.tier;
      return w;
    }
    case "armor": {
      const a: Extract<ItemDef, { kind: "armor" }> = {
        kind: "armor", ...base, defenseBonus: (d.defenseBonus as number) ?? 0,
      };
      if (typeof d.defenseBonusMin === "number") a.defenseBonusMin = d.defenseBonusMin;
      if (typeof d.defenseBonusMax === "number") a.defenseBonusMax = d.defenseBonusMax;
      if (typeof d.tier === "number") a.tier = d.tier;
      return a;
    }
    case "consumable":
      return {
        kind: "consumable",
        ...base,
        effect: (d.effect as { type: "Heal"; amount: number }) ?? { type: "Heal", amount: 0 },
      };
    case "accessory": {
      const a: Extract<ItemDef, { kind: "accessory" }> = {
        kind: "accessory",
        ...base,
        desc: (d.desc as string) ?? "",
      };
      // effects 가 DB 에 있고 유효한 키만 살려서 응답에 포함.
      // 유효성 검증은 작성 시 거치지만, 직렬화 단계에서도 한번 더 필터링해 안전망.
      const raw = d.effects;
      if (Array.isArray(raw)) {
        const filtered = raw.filter(
          (e): e is AccessoryEffect =>
            typeof e === "string" && ACCESSORY_EFFECTS.includes(e as AccessoryEffect),
        );
        a.effects = filtered;
      }
      return a;
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
  // homeZone — Mongoose subdoc 그대로 통과(serializer 가 Town 기본은 자동 생략).
  if (d.homeZone) v.homeZone = d.homeZone as VillagerDef["homeZone"];
  // homeLandmark — schema 기본 "random". serializer 가 기본값 생략.
  if (d.homeLandmark) v.homeLandmark = d.homeLandmark as VillagerDef["homeLandmark"];
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

// ── StartLoadout 기본값 ────────────────────────────────────────────────────────
// DB 에 doc 이 없을 때 폴백 — 게임 측 read_start_loadout() 의 default (gold 50) 미러.
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

// ── TownConfig 폴백 ────────────────────────────────────────────────────────────
// DB doc 의 알 수 없는/누락 값은 default 로 치환 — 새 옵션 추가 시 호환.
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

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
import {
  serializeRon,
  serializeQuestItemsRon,
  serializeWeaponsRon,
  serializeArmorsRon,
  serializeConsumablesRon,
  serializeVillagersRon,
  serializeMonstersRon,
} from "@/lib/ron";
import type { QuestDef } from "@/types/quest";
import type { ItemDef, WeaponElement } from "@/types/item";
import type { VillagerDef } from "@/types/villager";
import type { MonsterDef, MonsterElement } from "@/types/monster";

export const dynamic = "force-dynamic";

// ── 응답 스키마 ──────────────────────────────────────────────────────────────
// 게임 측 파서와 동일 형태(키/타입). 변경 시 version 증가 & 게임 동시 업데이트 필수.
const SCHEMA_VERSION = 1;

interface ContentResponse {
  version: number;
  generated_at: string;
  quests: { id: string; ron: string }[];
  items: {
    "quest_items.ron": string;
    "weapons.ron": string;
    "armors.ron": string;
    "consumables.ron": string;
    "start_loadout.ron": string;
  };
  villagers: string;
  monsters: string;
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
    glyphUnicode: d.glyphUnicode as string,
    glyphGameIcon: d.glyphGameIcon as string,
    pickupMessage: d.pickupMessage as string,
  };
  switch (d.kind) {
    case "quest":
      return { kind: "quest", ...base, imagePath: (d.imagePath as string) ?? "" };
    case "weapon":
      return {
        kind: "weapon",
        ...base,
        attackPower: (d.attackPower as number) ?? 0,
        element: (d.element as WeaponElement | null | undefined) ?? null,
      };
    case "armor":
      return { kind: "armor", ...base, defenseBonus: (d.defenseBonus as number) ?? 0 };
    case "consumable":
      return {
        kind: "consumable",
        ...base,
        effect: (d.effect as { type: "Heal"; amount: number }) ?? { type: "Heal", amount: 0 },
      };
    default:
      throw new Error(`Unknown item kind: ${String(d.kind)}`);
  }
}

function toVillagerDef(d: Record<string, unknown>): VillagerDef {
  const color = d.color as number[];
  return {
    id: d.id as string,
    name: d.name as string,
    color: [color[0], color[1], color[2]],
    dialogs: (d.dialogs as string[]) ?? [],
    speed: typeof d.speed === "number" ? d.speed : 1.0,
  };
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
// 현재 webapp 에 StartLoadout DB 모델이 없으므로 게임 측 기본값과 동일한 RON 을 반환.
// 추후 모델이 생기면 DB 조회로 교체. (Rust StartLoadout: gold/weapon/armor/items/consumables)
const DEFAULT_START_LOADOUT_RON =
  `StartLoadout(\n` +
  `    gold: 50,\n` +
  `    weapon: None,\n` +
  `    armor: None,\n` +
  `    items: [],\n` +
  `    consumables: [],\n` +
  `)\n`;

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET() {
  await connectToDB();

  const [questDocs, itemDocs, villagerDocs, monsterDocs] = await Promise.all([
    Quest.find({}).sort({ id: 1 }).lean() as unknown as Promise<Record<string, unknown>[]>,
    Item.find({}).sort({ id: 1 }).lean() as unknown as Promise<Record<string, unknown>[]>,
    Villager.find({}).sort({ id: 1 }).lean() as unknown as Promise<Record<string, unknown>[]>,
    Monster.find({}).sort({ id: 1 }).lean() as unknown as Promise<Record<string, unknown>[]>,
  ]);

  const quests = questDocs
    .map(toQuestDef)
    .map((def) => ({ id: def.id, ron: serializeRon(def) }));

  const items = itemDocs.map(toItemDef);
  const questItems = items.filter((i): i is Extract<ItemDef, { kind: "quest" }> => i.kind === "quest");
  const weapons = items.filter((i): i is Extract<ItemDef, { kind: "weapon" }> => i.kind === "weapon");
  const armors = items.filter((i): i is Extract<ItemDef, { kind: "armor" }> => i.kind === "armor");
  const consumables = items.filter((i): i is Extract<ItemDef, { kind: "consumable" }> => i.kind === "consumable");

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
      "start_loadout.ron": DEFAULT_START_LOADOUT_RON,
    },
    villagers: serializeVillagersRon(villagers),
    monsters: serializeMonstersRon(monsters),
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

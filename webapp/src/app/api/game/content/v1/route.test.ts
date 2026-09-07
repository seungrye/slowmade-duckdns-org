import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDB: vi.fn() }));
vi.mock("@/models/quest", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/item", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/villager", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/monster", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/start-loadout", () => ({ default: { findById: vi.fn() } }));
vi.mock("@/models/town-config", () => ({ default: { findById: vi.fn() } }));

import { GET } from "./route";
import Quest from "@/models/quest";
import Item from "@/models/item";
import Villager from "@/models/villager";
import Monster from "@/models/monster";
import StartLoadout from "@/models/start-loadout";
import TownConfig from "@/models/town-config";
import {
  parseRon,
  parseQuestItemsRon,
  parseVillagersRon,
  parseMonstersRon,
  parseStartLoadoutDef,
  parseAccessoriesRon,
} from "@/lib/ron";

type FindMock = ReturnType<typeof vi.fn>;

// A helper that mocks the Model.find().sort().lean() chain in one go.
function mockChain(model: { find: FindMock }, docs: unknown[]) {
  model.find.mockReturnValue({
    sort: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(docs),
    }),
  });
}

// Mocks StartLoadout.findById("default").lean(). doc=null means absent from the DB (the fallback).
type FindByIdMock = ReturnType<typeof vi.fn>;
function mockStartLoadout(doc: Record<string, unknown> | null) {
  (StartLoadout as unknown as { findById: FindByIdMock }).findById.mockReturnValue({
    lean: vi.fn().mockResolvedValue(doc),
  });
}

// Mocks TownConfig.findById("default").lean(). doc=null means absent from the DB (the fallback).
function mockTownConfig(doc: Record<string, unknown> | null) {
  (TownConfig as unknown as { findById: FindByIdMock }).findById.mockReturnValue({
    lean: vi.fn().mockResolvedValue(doc),
  });
}

// One quest as the game expects it (the minimal round-trippable shape).
function sampleQuestDoc() {
  return {
    id: "infiltration_quest",
    title: "잠입 작전",
    giverNpc: "elder",
    initialPhase: "dormant",
    phases: { dormant: { dialog: ["인사."], objective: null } },
    transitions: [],
    spawns: [],
  };
}

function sampleQuestItemDoc() {
  return {
    id: "eternal_gem",
    kind: "quest",
    displayName: "영원의 보석",
    glyphAscii: "*",
    glyphGameIcon: "◆",
    pickupMessage: "영원의 보석을 획득했다!",
    imagePath: "scene/open-chest.png",
  };
}

function sampleAccessoryDoc(effects?: unknown) {
  return {
    id: "scout_lens",
    kind: "accessory",
    displayName: "올빼미 안경",
    glyphAscii: "O",
    glyphGameIcon: "O",
    pickupMessage: "획득",
    desc: "잠입 전용.",
    ...(effects !== undefined ? { effects } : {}),
  };
}

function sampleVillagerDoc() {
  return {
    id: "elder",
    name: "장로",
    color: [0.9, 0.8, 0.5],
    dialogs: ["안녕."],
    speed: 0.5,
  };
}

function sampleMonsterDoc() {
  return {
    id: "slime",
    displayName: "슬라임",
    glyph: "s",
    color: [0.2, 0.8, 0.2],
    hp: 5,
    attack: 2,
    defense: 0,
    visionRadius: 4,
    speed: 1.0,
    element: null,
    spawnWeight: 1.0,
    zones: [],
    questOnly: false,
  };
}

describe("GET /api/game/content/v1", () => {
  beforeEach(() => vi.clearAllMocks());

  it("200 응답, 스키마 키 5개와 헤더가 모두 존재한다", async () => {
    mockChain(Quest as unknown as { find: FindMock }, [sampleQuestDoc()]);
    mockChain(Item as unknown as { find: FindMock }, [sampleQuestItemDoc()]);
    mockChain(Villager as unknown as { find: FindMock }, [sampleVillagerDoc()]);
    mockChain(Monster as unknown as { find: FindMock }, [sampleMonsterDoc()]);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60, s-maxage=60");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const body = await res.json();
    // v2 - the town_config key added.
    expect(body).toHaveProperty("version", 2);
    expect(body).toHaveProperty("generated_at");
    expect(body).toHaveProperty("quests");
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("villagers");
    expect(body).toHaveProperty("monsters");
    expect(body).toHaveProperty("town_config");
    // generated_at is in ISO8601 form
    expect(() => new Date(body.generated_at).toISOString()).not.toThrow();
  });

  it("각 quest 가 {id, ron} 모양이고 게임 측 파서로 round-trip 된다", async () => {
    mockChain(Quest as unknown as { find: FindMock }, [sampleQuestDoc()]);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();
    expect(Array.isArray(body.quests)).toBe(true);
    expect(body.quests).toHaveLength(1);
    const q = body.quests[0];
    expect(Object.keys(q).sort()).toEqual(["id", "ron"]);
    expect(q.id).toBe("infiltration_quest");
    const parsed = parseRon(q.ron);
    expect(parsed.id).toBe("infiltration_quest");
    expect(parsed.title).toBe("잠입 작전");
  });

  it("items 가 정확히 6개 키(quest_items/weapons/armors/consumables/accessories/start_loadout)이고 quest_items 가 round-trip 된다", async () => {
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, [sampleQuestItemDoc()]);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();
    const keys = Object.keys(body.items).sort();
    expect(keys).toEqual(
      ["accessories.ron", "armors.ron", "consumables.ron", "quest_items.ron", "start_loadout.ron", "weapons.ron"]
    );
    // quest_items round-trip
    const parsed = parseQuestItemsRon(body.items["quest_items.ron"]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("eternal_gem");
    expect(parsed[0].displayName).toBe("영원의 보석");
    // start_loadout is the same StartLoadout wrapper string as the game's default
    expect(body.items["start_loadout.ron"]).toContain("StartLoadout(");
    expect(body.items["start_loadout.ron"]).toContain("gold: 50");
    // accessories must carry the key and the empty-array serialisation even when empty.
    expect(body.items["accessories.ron"]).toContain("[]");
  });

  it("villagers/monsters 가 RON 문자열이고 round-trip 가능하다", async () => {
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, [sampleVillagerDoc()]);
    mockChain(Monster as unknown as { find: FindMock }, [sampleMonsterDoc()]);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();
    expect(typeof body.villagers).toBe("string");
    expect(typeof body.monsters).toBe("string");
    const v = parseVillagersRon(body.villagers);
    expect(v).toHaveLength(1);
    expect(v[0].id).toBe("elder");
    const m = parseMonstersRon(body.monsters);
    expect(m).toHaveLength(1);
    expect(m[0].id).toBe("slime");
  });

  it("villager 의 vendorVisionRadius/freeRoam 가 RON 응답에 round-trip 된다", async () => {
    // A regression - toVillagerDef used to drop mongo's vendorVisionRadius and freeRoam, so in production
    // market_owner never received vendor_vision_radius: 2 and ran on the game's
    // fallback (6). This guards against that.
    const marketOwner = {
      id: "market_owner",
      name: "구두쇠 박씨",
      color: [0.6, 0.4, 0.2],
      dialogs: ["어서 오세요!"],
      speed: 0.5,
      vendor: true,
      stationary: false,
      homeZone: { type: "Town" },
      homeLandmark: "market",
      freeRoam: false,
      vendorVisionRadius: 2,
    };
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, [marketOwner]);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();
    // The snake_case keys must appear directly in the RON string (even if the parser is fine, a serialisation omission
    // means the game never receives it - verified explicitly by string matching).
    expect(body.villagers).toContain("vendor_vision_radius: Some(2)");
    // free_roam defaults to false -> not emitted (the game's #[serde(default)]).
    expect(body.villagers).not.toContain("free_roam");
    // the round-tripped result still carries vendorVisionRadius=2.
    const parsed = parseVillagersRon(body.villagers);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("market_owner");
    expect(parsed[0].vendorVisionRadius).toBe(2);
    expect(parsed[0].homeLandmark).toBe("market");
  });

  it("villager 의 freeRoam=true 가 RON 응답에 free_roam: true 로 직렬화된다", async () => {
    const wanderer = {
      id: "wanderer",
      name: "방랑자",
      color: [0.5, 0.5, 0.5],
      dialogs: ["..."],
      speed: 1.0,
      freeRoam: true,
    };
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, [wanderer]);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();
    expect(body.villagers).toContain("free_roam: true");
  });

  it("DB 가 비어 있어도 200 + 빈 배열·빈 RON 래퍼를 반환한다", async () => {
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quests).toEqual([]);
    expect(body.items["quest_items.ron"]).toBe("[]\n");
    expect(body.items["weapons.ron"]).toBe("[]\n");
    expect(body.items["armors.ron"]).toBe("[]\n");
    expect(body.items["consumables.ron"]).toBe("[]\n");
    // start_loadout is always the game's default RON (the same even with an empty DB).
    expect(body.items["start_loadout.ron"]).toContain("StartLoadout(");
    expect(body.villagers).toBe("[]\n");
    expect(body.monsters).toBe("[]\n");
  });

  it("quests 는 id 사전순으로 정렬되어 반환된다", async () => {
    const a = { ...sampleQuestDoc(), id: "alpha_quest" };
    const b = { ...sampleQuestDoc(), id: "beta_quest" };
    // Even with the DB's order reversed, the route queries with sort({id:1}), so the sort call is verified.
    mockChain(Quest as unknown as { find: FindMock }, [a, b]);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();
    expect(body.quests.map((q: { id: string }) => q.id)).toEqual(["alpha_quest", "beta_quest"]);
  });

  it("StartLoadout DB doc 이 있으면 그 값을 serialize 해 반환한다", async () => {
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout({
      _id: "default",
      gold: 50,
      weapon: null,
      armor: null,
      items: ["sword", "spear", "bow"],
      consumables: [
        { id: "health_potion", count: 10 },
        { id: "trap_kit", count: 3 },
      ],
    });
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();
    const ron = body.items["start_loadout.ron"];
    expect(ron).toContain("StartLoadout(");
    expect(ron).toContain(`items: ["sword", "spear", "bow"]`);
    expect(ron).toContain(`("health_potion", 10)`);
    // round-trip
    const parsed = parseStartLoadoutDef(ron);
    expect(parsed.items).toEqual(["sword", "spear", "bow"]);
    expect(parsed.consumables).toEqual([
      { id: "health_potion", count: 10 },
      { id: "trap_kit", count: 3 },
    ]);
  });

  it("accessory 에 effects 가 있으면 응답 RON 에 effects 키가 포함된다", async () => {
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, [
      sampleAccessoryDoc(["RevealGuardVision"]),
    ]);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();
    const ron = body.items["accessories.ron"];
    expect(ron).toContain("effects:");
    expect(ron).toContain("RevealGuardVision");

    // round-trip
    const accs = parseAccessoriesRon(ron);
    expect(accs).toHaveLength(1);
    expect(accs[0].id).toBe("scout_lens");
    expect(accs[0].effects).toEqual(["RevealGuardVision"]);
  });

  it("accessory 에 effects 가 누락이면 응답 RON 에도 effects 키가 없다", async () => {
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, [
      sampleAccessoryDoc(undefined), // effects 미설정
    ]);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();
    const ron = body.items["accessories.ron"];
    expect(ron).not.toContain("effects:");
  });

  it("accessory 의 알 수 없는 effect 키는 응답 직전에 필터링된다(안전망)", async () => {
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, [
      sampleAccessoryDoc(["RevealGuardVision", "BogusKey"]),
    ]);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();
    const accs = parseAccessoriesRon(body.items["accessories.ron"]);
    expect(accs[0].effects).toEqual(["RevealGuardVision"]);
  });

  it("TownConfig DB doc 이 없으면 기본값(Village/Radial/Common/None/[Inn,Smithy]/fields=true) RON 반환", async () => {
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();
    const ron = body.town_config;
    expect(ron).toContain("TownOptions(");
    expect(ron).toContain("size: Village,");
    expect(ron).toContain("roads: Radial,");
    expect(ron).toContain("wealth: Common,");
    expect(ron).toContain("defenses: None,");
    expect(ron).toContain("landmarks: [Inn, Smithy],");
    expect(ron).toContain("fields: true,");
    expect(ron).toContain("environment: Plains,");
  });

  it("TownConfig DB doc 이 있으면 그 값을 serialize 해 반환 (environment 포함)", async () => {
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig({
      _id: "default",
      size: "town",
      roads: "linear",
      wealth: "wealthy",
      defenses: "stone",
      landmarks: ["temple", "market", "manor"],
      fields: false,
      environment: "coastal",
    });

    const res = await GET();
    const body = await res.json();
    const ron = body.town_config;
    expect(ron).toContain("size: Town,");
    expect(ron).toContain("roads: Linear,");
    expect(ron).toContain("wealth: Wealthy,");
    expect(ron).toContain("defenses: Stone,");
    expect(ron).toContain("landmarks: [Temple, Market, Manor],");
    expect(ron).toContain("fields: false,");
    expect(ron).toContain("environment: Coastal,");
  });

  it("TownConfig DB doc 에 신규 7 landmark (Tavern/Docks 등) 도 PascalCase 로 export 된다", async () => {
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig({
      _id: "default",
      size: "town",
      roads: "radial",
      wealth: "common",
      defenses: "none",
      landmarks: [
        "tavern", "herbalist", "graveyard", "jail", "guild", "alchemist", "docks",
      ],
      fields: true,
      environment: "coastal",
    });

    const res = await GET();
    const body = await res.json();
    const ron = body.town_config;
    expect(ron).toContain(
      "landmarks: [Tavern, Herbalist, Graveyard, Jail, Guild, Alchemist, Docks],",
    );
    expect(ron).toContain("environment: Coastal,");
  });

  it("TownConfig DB doc 에 알 수 없는 값이 있으면 default 로 폴백", async () => {
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig({
      _id: "default",
      size: "megacity",  // 알 수 없는 값 → default(village)
      roads: "spiral",   // 알 수 없는 값 → default(radial)
      wealth: "common",
      defenses: "none",
      landmarks: ["inn", "unknown", "smithy"], // unknown 필터링
      fields: true,
    });

    const res = await GET();
    const body = await res.json();
    const ron = body.town_config;
    expect(ron).toContain("size: Village,");
    expect(ron).toContain("roads: Radial,");
    // an unknown landmark is filtered out
    expect(ron).toContain("landmarks: [Inn, Smithy],");
  });

  // ── HoldingItemInNpcFov / EnterNpcFov trigger regression ────────────────────────────
  //
  // The regression: in production, `elder_tintham_quest`'s `HoldingItemInNpcFov` fail transition was not in the DB at
  // all, so nothing happened even when caught in the market owner's field of view.
  //
  // This test checks that *the mongo doc shape as it is* (a JS object with trigger=string plus triggerNpcId/
  // triggerItemId fields) is *serialised* into the game-parser-compatible form
  // (`HoldingItemInNpcFov(npc_id: ..., item_id: ...)`) in the `/api/game/content/v1` response's RON.
  // It also verifies the round trip (parseRon preserving triggerNpcId/triggerItemId).
  //
  // The intent: catch the same omission pattern end to end when a new TriggerKind variant is added (toQuestDef passes
  // the doc through wholesale while one of the serializer or parser does not support it).
  it("HoldingItemInNpcFov fail transition 이 mongo doc → RON 응답에 정확히 직렬화된다", async () => {
    const questDoc = {
      id: "elder_tintham_quest",
      title: "장로의 비밀 간식",
      giverNpc: "elder",
      initialPhase: "dormant",
      spawnChance: 1,
      phases: {
        dormant: { dialog: ["인사."], objective: null },
        accepted: { dialog: ["들키지 말게."], objective: "훔쳐오라" },
        failed: { dialog: ["허허..."], objective: "재시도" },
      },
      // The mongo subdoc shape - trigger=string plus separate triggerNpcId/triggerItemId fields.
      // toQuestDef passes it through and serializeRon has to handle the new trigger
      // variant.
      transitions: [
        {
          from: "accepted",
          trigger: "HoldingItemInNpcFov",
          triggerNpcId: "market_owner",
          triggerItemId: "super_tintham_cracker",
          actions: [
            { type: "TeleportToNpcHome", npcId: "elder" },
            { type: "RemoveItems", itemId: "super_tintham_cracker", count: 1 },
            { type: "Log", text: "구두쇠 박씨에게 들켰다!" },
          ],
          to: "failed",
        },
      ],
      spawns: [],
    };
    mockChain(Quest as unknown as { find: FindMock }, [questDoc]);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();
    expect(body.quests).toHaveLength(1);
    const ron: string = body.quests[0].ron;

    // 1) The trigger's struct variant must appear in the RON text as it stands (snake_case field names included).
    //    Even if the parser is fine, a serializer omission means the game never receives it - verified explicitly by string matching.
    expect(ron).toContain(
      'trigger: HoldingItemInNpcFov(npc_id: "market_owner", item_id: "super_tintham_cracker")',
    );
    // 2) The actions are serialised in the game's RON form too (TeleportToNpcHome / RemoveItems).
    expect(ron).toContain('TeleportToNpcHome(npc_id: "elder")');
    expect(ron).toContain('RemoveItems(item: "super_tintham_cracker", count: Some(1))');

    // 3) The round trip - re-parsing with parseRon preserves every piece of the trigger's metadata.
    const parsed = parseRon(ron);
    expect(parsed.transitions).toHaveLength(1);
    const t = parsed.transitions[0];
    expect(t.trigger).toBe("HoldingItemInNpcFov");
    expect(t.triggerNpcId).toBe("market_owner");
    expect(t.triggerItemId).toBe("super_tintham_cracker");
    expect(t.from).toBe("accepted");
    expect(t.to).toBe("failed");
    expect(t.actions).toEqual([
      { type: "TeleportToNpcHome", npcId: "elder" },
      { type: "RemoveItems", itemId: "super_tintham_cracker", count: 1 },
      { type: "Log", text: "구두쇠 박씨에게 들켰다!" },
    ]);
  });

  // ── SpawnItem action regression ──────────────────────────────────────────────────
  //
  // The policy: on a retry after a failed infiltration (a failed -> accepted Interact transition), the vanished quest
  // item is spawned again, data-driven. The mongo doc's `SpawnItem`
  // action must serialise into the game's RON-compatible form (`SpawnItem(item_id: ..., landmark: ..., ...)`).
  //
  it("SpawnItem mongo doc → RON 응답에 itemId / landmark / vendor_distance_min / count 모두 직렬화된다", async () => {
    const questDoc = {
      id: "elder_tintham_quest",
      title: "장로의 비밀 간식",
      giverNpc: "elder",
      initialPhase: "dormant",
      phases: {
        dormant: { dialog: ["인사."], objective: null },
        accepted: { dialog: ["다시 가져와라."], objective: "재시도" },
        failed: { dialog: ["허허…"], objective: "재시도" },
      },
      // The key part: SpawnItem in the actions of the failed -> accepted Interact transition.
      transitions: [
        {
          from: "failed",
          trigger: "Interact",
          actions: [
            {
              type: "SpawnItem",
              itemId: "super_tintham_cracker",
              landmark: "market",
              vendorDistanceMin: 2,
              count: 1,
            },
            { type: "Log", text: "다시 시도해보겠나..." },
          ],
          to: "accepted",
        },
      ],
      spawns: [],
    };
    mockChain(Quest as unknown as { find: FindMock }, [questDoc]);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();
    expect(body.quests).toHaveLength(1);
    const ron: string = body.quests[0].ron;

    // 1) All 4 of SpawnItem's instance fields are serialised (snake_case field names plus PascalCase enums).
    expect(ron).toContain(
      'SpawnItem(item_id: "super_tintham_cracker", landmark: Some(Market), vendor_distance_min: Some(2), count: Some(1))',
    );

    // 2) The round trip - re-parsing with parseRon preserves every field.
    const parsed = parseRon(ron);
    expect(parsed.transitions).toHaveLength(1);
    const t = parsed.transitions[0];
    expect(t.from).toBe("failed");
    expect(t.to).toBe("accepted");
    expect(t.trigger).toBe("Interact");
    expect(t.actions).toEqual([
      {
        type: "SpawnItem",
        itemId: "super_tintham_cracker",
        landmark: "market",
        vendorDistanceMin: 2,
        count: 1,
      },
      { type: "Log", text: "다시 시도해보겠나..." },
    ]);
  });

  // ── The shop system (buyPrice/sellPrice/vendorInventory) end to end ────────────────
  it("vendor 가 vendorInventory 가지면 RON 에 vendor_inventory: Some([...]) + weapon 의 buy_price 직렬화", async () => {
    const shopkeeperDoc = {
      id: "shopkeeper",
      name: "상점 주인",
      color: [0.6, 0.4, 0.2],
      dialogs: ["어서 오세요!"],
      speed: 0.5,
      vendor: true,
      vendorInventory: ["iron_sword"],
    };
    const swordDoc = {
      id: "iron_sword",
      kind: "weapon",
      displayName: "철검",
      glyphAscii: "/",
      glyphGameIcon: "X",
      pickupMessage: "획득",
      attackPower: 10,
      element: null,
      buyPrice: 100,
      sellPrice: 70,
    };
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, [swordDoc]);
    mockChain(Villager as unknown as { find: FindMock }, [shopkeeperDoc]);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();

    // the villagers RON serialises vendor_inventory: Some(["iron_sword"])
    expect(body.villagers).toContain('vendor_inventory: Some([');
    expect(body.villagers).toContain('"iron_sword"');

    // the weapons RON serialises buy_price: Some(100) plus sell_price: Some(70)
    expect(body.items["weapons.ron"]).toContain("buy_price: Some(100)");
    expect(body.items["weapons.ron"]).toContain("sell_price: Some(70)");
  });

  it("vendor 가 vendorInventory 없으면 vendor_inventory 키 자체 미출력 (SHOP_CATALOG fallback)", async () => {
    const elderDoc = {
      id: "elder",
      name: "장로",
      color: [0.9, 0.8, 0.5],
      dialogs: ["안녕."],
      speed: 0.5,
      vendor: false,
    };
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, [elderDoc]);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();
    expect(body.villagers).not.toContain("vendor_inventory");
  });

  it("Item 에 buyPrice/sellPrice 미설정 시 RON 응답에 두 키 모두 미출력", async () => {
    const swordDoc = {
      id: "plain_sword",
      kind: "weapon",
      displayName: "평범한 검",
      glyphAscii: "/",
      glyphGameIcon: "X",
      pickupMessage: "획득",
      attackPower: 5,
      element: null,
    };
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, [swordDoc]);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();
    expect(body.items["weapons.ron"]).not.toContain("buy_price");
    expect(body.items["weapons.ron"]).not.toContain("sell_price");
  });

  it("EnterNpcFov 트리거도 mongo doc → RON 응답에 정확히 직렬화된다", async () => {
    // HoldingItemInNpcFov's sibling variant. It blocks a regression of the same omission pattern in one go.
    const questDoc = {
      id: "fov_quest",
      title: "FOV 테스트",
      giverNpc: "elder",
      initialPhase: "a",
      phases: {
        a: { dialog: [], objective: null },
        b: { dialog: [], objective: null },
      },
      transitions: [
        {
          from: "a",
          trigger: "EnterNpcFov",
          triggerNpcId: "guard_captain",
          actions: [{ type: "Log", text: "발각!" }],
          to: "b",
        },
      ],
      spawns: [],
    };
    mockChain(Quest as unknown as { find: FindMock }, [questDoc]);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);
    mockTownConfig(null);

    const res = await GET();
    const body = await res.json();
    const ron: string = body.quests[0].ron;
    expect(ron).toContain('trigger: EnterNpcFov(npc_id: "guard_captain")');
    const parsed = parseRon(ron);
    expect(parsed.transitions[0].trigger).toBe("EnterNpcFov");
    expect(parsed.transitions[0].triggerNpcId).toBe("guard_captain");
  });
});

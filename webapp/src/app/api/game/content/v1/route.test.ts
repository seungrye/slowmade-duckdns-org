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

// 헬퍼: Model.find().sort().lean() 체이닝을 한 번에 모킹한다.
function mockChain(model: { find: FindMock }, docs: unknown[]) {
  model.find.mockReturnValue({
    sort: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(docs),
    }),
  });
}

// StartLoadout.findById("default").lean() 모킹. doc=null → DB 미존재(폴백).
type FindByIdMock = ReturnType<typeof vi.fn>;
function mockStartLoadout(doc: Record<string, unknown> | null) {
  (StartLoadout as unknown as { findById: FindByIdMock }).findById.mockReturnValue({
    lean: vi.fn().mockResolvedValue(doc),
  });
}

// TownConfig.findById("default").lean() 모킹. doc=null → DB 미존재(폴백).
function mockTownConfig(doc: Record<string, unknown> | null) {
  (TownConfig as unknown as { findById: FindByIdMock }).findById.mockReturnValue({
    lean: vi.fn().mockResolvedValue(doc),
  });
}

// 게임이 기대하는 quest 한 건(round-trip 가능한 최소 형태).
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
    // v2 — town_config 키 추가.
    expect(body).toHaveProperty("version", 2);
    expect(body).toHaveProperty("generated_at");
    expect(body).toHaveProperty("quests");
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("villagers");
    expect(body).toHaveProperty("monsters");
    expect(body).toHaveProperty("town_config");
    // generated_at 은 ISO8601 형태
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
    // start_loadout 은 게임 기본값과 동일한 StartLoadout 래퍼 문자열
    expect(body.items["start_loadout.ron"]).toContain("StartLoadout(");
    expect(body.items["start_loadout.ron"]).toContain("gold: 50");
    // accessories 는 비어있어도 키와 빈 배열 직렬화 형태가 들어 있어야 한다.
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
    // 회귀 — 과거 toVillagerDef 가 mongo 의 vendorVisionRadius/freeRoam 을
    // 누락해, 라이브에서 market_owner 가 vendor_vision_radius: 2 를 받지 못하고
    // 게임 측 fallback (6) 으로 동작한 버그 방지.
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
    // RON 문자열에 snake_case 키가 직접 보여야 한다 (parser 가 OK 해도 직렬화 누락이면
    // 게임은 못 받는다 — 문자열 매칭으로 명시 검증).
    expect(body.villagers).toContain("vendor_vision_radius: Some(2)");
    // free_roam 은 기본 false → 출력 안 함 (게임 측 #[serde(default)]).
    expect(body.villagers).not.toContain("free_roam");
    // round-trip 한 결과에 vendorVisionRadius=2 가 남아 있다.
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
    // start_loadout 은 항상 게임 기본값 RON (빈 DB 여도 동일).
    expect(body.items["start_loadout.ron"]).toContain("StartLoadout(");
    expect(body.villagers).toBe("[]\n");
    expect(body.monsters).toBe("[]\n");
  });

  it("quests 는 id 사전순으로 정렬되어 반환된다", async () => {
    const a = { ...sampleQuestDoc(), id: "alpha_quest" };
    const b = { ...sampleQuestDoc(), id: "beta_quest" };
    // DB 응답 순서가 뒤집혀 있어도, 라우트가 sort({id:1}) 로 조회하므로 sort 호출이 일어남을 검증.
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
    // landmarks 의 unknown 은 필터링됨
    expect(ron).toContain("landmarks: [Inn, Smithy],");
  });

  // ── HoldingItemInNpcFov / EnterNpcFov 트리거 회귀 ────────────────────────────
  //
  // 회귀: 라이브에서 `elder_tintham_quest` 의 `HoldingItemInNpcFov` fail transition
  // 자체가 DB 에 들어 있지 않아 시장 주인 시야에 걸려도 아무 일도 일어나지 않았다.
  //
  // 이 테스트는 *mongo doc 형태 그대로* (JS object: trigger=string, triggerNpcId/
  // triggerItemId 필드) 가 `/api/game/content/v1` 응답의 RON 에 게임-파서 호환
  // 형식(`HoldingItemInNpcFov(npc_id: ..., item_id: ...)`) 으로 *직렬화* 되는지
  // 확인한다. 또 round-trip 도 검증(parseRon → triggerNpcId/triggerItemId 보존).
  //
  // 의도: 새 TriggerKind variant 가 추가될 때 같은 누락 패턴(toQuestDef 가 doc 을
  // 통째로 통과시키는데 serializer/parser 중 하나가 미지원) 을 끝-끝 단에서 잡는다.
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
      // mongo subdoc 형태 — trigger=string + triggerNpcId/triggerItemId 별도 필드.
      // toQuestDef 가 그대로 통과시키고 serializeRon 이 새 trigger variant 를
      // 처리해야 한다.
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

    // 1) RON 텍스트에 trigger 의 구조체 변형이 그대로 보여야 한다 (snake_case 필드명 포함).
    //    parser 가 OK 해도 serializer 가 누락하면 게임은 받지 못한다 — 문자열 매칭으로 명시 검증.
    expect(ron).toContain(
      'trigger: HoldingItemInNpcFov(npc_id: "market_owner", item_id: "super_tintham_cracker")',
    );
    // 2) action 들도 game RON 형식으로 직렬화 (TeleportToNpcHome / RemoveItems).
    expect(ron).toContain('TeleportToNpcHome(npc_id: "elder")');
    expect(ron).toContain('RemoveItems(item: "super_tintham_cracker", count: Some(1))');

    // 3) round-trip — parseRon 으로 다시 파싱했을 때 trigger 메타가 모두 보존.
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

  // ── SpawnItem action 회귀 ──────────────────────────────────────────────────
  //
  // 정책: 잠입 실패 후 재시도 (failed → accepted Interact transition) 에서
  // 사라진 quest item 을 데이터-주도로 다시 spawn. mongo doc 의 `SpawnItem`
  // 액션이 게임 RON 호환 형식 (`SpawnItem(item_id: ..., landmark: ..., ...)`) 으로
  // 직렬화되어야 한다.
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
      // 핵심: failed → accepted Interact transition 의 actions 에 SpawnItem.
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

    // 1) SpawnItem 의 4 개 인스턴스 필드 모두 직렬화 (snake_case 필드명 + PascalCase enum).
    expect(ron).toContain(
      'SpawnItem(item_id: "super_tintham_cracker", landmark: Some(Market), vendor_distance_min: Some(2), count: Some(1))',
    );

    // 2) round-trip — parseRon 으로 다시 파싱했을 때 모든 필드 보존.
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

  it("EnterNpcFov 트리거도 mongo doc → RON 응답에 정확히 직렬화된다", async () => {
    // HoldingItemInNpcFov 의 동기 variant. 같은 누락 패턴 회귀를 한 번에 막는다.
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

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDB: vi.fn() }));
vi.mock("@/models/quest", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/item", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/villager", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/monster", () => ({ default: { find: vi.fn() } }));
vi.mock("@/models/start-loadout", () => ({ default: { findById: vi.fn() } }));

import { GET } from "./route";
import Quest from "@/models/quest";
import Item from "@/models/item";
import Villager from "@/models/villager";
import Monster from "@/models/monster";
import StartLoadout from "@/models/start-loadout";
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

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60, s-maxage=60");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const body = await res.json();
    expect(body).toHaveProperty("version", 1);
    expect(body).toHaveProperty("generated_at");
    expect(body).toHaveProperty("quests");
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("villagers");
    expect(body).toHaveProperty("monsters");
    // generated_at 은 ISO8601 형태
    expect(() => new Date(body.generated_at).toISOString()).not.toThrow();
  });

  it("각 quest 가 {id, ron} 모양이고 게임 측 파서로 round-trip 된다", async () => {
    mockChain(Quest as unknown as { find: FindMock }, [sampleQuestDoc()]);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);

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

  it("DB 가 비어 있어도 200 + 빈 배열·빈 RON 래퍼를 반환한다", async () => {
    mockChain(Quest as unknown as { find: FindMock }, []);
    mockChain(Item as unknown as { find: FindMock }, []);
    mockChain(Villager as unknown as { find: FindMock }, []);
    mockChain(Monster as unknown as { find: FindMock }, []);
    mockStartLoadout(null);

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

    const res = await GET();
    const body = await res.json();
    const accs = parseAccessoriesRon(body.items["accessories.ron"]);
    expect(accs[0].effects).toEqual(["RevealGuardVision"]);
  });
});

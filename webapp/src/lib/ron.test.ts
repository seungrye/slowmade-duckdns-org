import { describe, it, expect } from "vitest";
import {
  parseRon, serializeRon,
  parseVillagersRon, serializeVillagersRon,
  parseQuestItemsRon, serializeQuestItemsRon,
  parseWeaponsRon, serializeWeaponsRon,
  parseArmorsRon, serializeArmorsRon,
  parseConsumablesRon, serializeConsumablesRon,
  parseMonstersRon, serializeMonstersRon,
} from "./ron";
import type { QuestDef } from "@/types/quest";
import type { VillagerDef } from "@/types/villager";
import type { MonsterDef } from "@/types/monster";

const SIMPLE_RON = `
#![enable(implicit_some)]
QuestDef(
    id: "test_quest",
    title: "테스트 퀘스트",
    giver_npc: "병사",
    initial_phase: "dormant",

    phases: {

        "dormant": QuestPhaseDef(
            dialog: [
                "안녕하세요.",
                "시작해볼까요?",
            ],
            objective: Some("병사와 대화하라."),
        ),

        "active": QuestPhaseDef(
            dialog: [
                "아이템을 찾아오세요.",
            ],
            objective: Some("던전에서 아이템을 가져와라."),
        ),

        "done": QuestPhaseDef(
            dialog: [],
            objective: None,
        ),
    },

    transitions: [
        Transition(from: "dormant", trigger: Interact, to: "active"),
        Transition(from: "active", trigger: Auto, when: HasItem("key_item"), to: "done"),
        Transition(from: "done", trigger: Interact,
            actions: [GiveItem("reward"), SetFlag(flag: "quest_done", value: "true")],
            to: "done"),
    ],

    spawns: [
        QuestSpawn(phase: "active", item: "key_item", zone: Dungeon(1)),
    ],
)
`;

describe("parseRon — 기본", () => {
  it("QuestDef 기본 필드 파싱", () => {
    const quest = parseRon(SIMPLE_RON);
    expect(quest.id).toBe("test_quest");
    expect(quest.title).toBe("테스트 퀘스트");
    expect(quest.giverNpc).toBe("병사");
    expect(quest.initialPhase).toBe("dormant");
  });

  it("페이즈 목록 파싱", () => {
    const quest = parseRon(SIMPLE_RON);
    expect(Object.keys(quest.phases)).toEqual(["dormant", "active", "done"]);
  });

  it("dialog 파싱", () => {
    const quest = parseRon(SIMPLE_RON);
    expect(quest.phases["dormant"].dialog).toEqual(["안녕하세요.", "시작해볼까요?"]);
  });

  it("Interact transition 파싱", () => {
    const quest = parseRon(SIMPLE_RON);
    expect(quest.transitions[0]).toEqual({
      from: "dormant", trigger: "Interact", actions: [], to: "active",
    });
  });

  it("Auto transition when 조건 파싱", () => {
    const quest = parseRon(SIMPLE_RON);
    const t = quest.transitions[1];
    expect(t.trigger).toBe("Auto");
    expect(t.when).toEqual({ type: "HasItem", itemId: "key_item" });
    expect(t.to).toBe("done");
  });

  it("transition actions (GiveItem / SetFlag) 파싱", () => {
    const quest = parseRon(SIMPLE_RON);
    const actions = quest.transitions[2].actions;
    expect(actions[0]).toEqual({ type: "GiveItem", itemId: "reward" });
    expect(actions[1]).toEqual({ type: "SetFlag", flag: "quest_done", value: "true" });
  });

  it("phases 는 dialog/objective 만 가진다", () => {
    const quest = parseRon(SIMPLE_RON);
    expect(quest.phases["dormant"]).toEqual({
      dialog: ["안녕하세요.", "시작해볼까요?"],
      objective: "병사와 대화하라.",
    });
  });

  it("objective Some/None 파싱", () => {
    const quest = parseRon(SIMPLE_RON);
    expect(quest.phases["dormant"].objective).toBe("병사와 대화하라.");
    expect(quest.phases["done"].objective).toBeNull();
  });

  it("spawns 파싱", () => {
    const quest = parseRon(SIMPLE_RON);
    expect(quest.spawns).toHaveLength(1);
    expect(quest.spawns[0]).toEqual({ phase: "active", item: "key_item", zone: { type: "Dungeon", level: 1 } });
  });

  it("implicit_some directive 가 있어도 파싱된다", () => {
    const quest = parseRon(SIMPLE_RON);
    expect(quest.id).toBe("test_quest");
  });
});

describe("parseRon — transition when 복합 조건", () => {
  const COMPLEX_COND_RON = `
#![enable(implicit_some)]
QuestDef(
    id: "cond_test",
    title: "조건 테스트",
    giver_npc: "NPC",
    initial_phase: "a",
    phases: {
        "a": QuestPhaseDef(dialog: [], objective: None),
        "b": QuestPhaseDef(dialog: [], objective: None),
        "c": QuestPhaseDef(dialog: [], objective: None),
        "d": QuestPhaseDef(dialog: [], objective: None),
    },
    transitions: [
        Transition(from: "a", trigger: Auto, when: And([HasItem("x"), FlagIs(flag: "f", value: "v")]), to: "b"),
        Transition(from: "a", trigger: Auto, when: Or([HasItem("y"), PhaseIs(quest: "q2", phase: "done")]), to: "c"),
        Transition(from: "a", trigger: Auto, when: Not(HasItem("z")), to: "d"),
    ],
    spawns: [],
)
`;

  it("And 조건 파싱", () => {
    const quest = parseRon(COMPLEX_COND_RON);
    expect(quest.transitions[0].when).toEqual({
      type: "And",
      conditions: [
        { type: "HasItem", itemId: "x" },
        { type: "FlagIs", flag: "f", value: "v" },
      ],
    });
  });

  it("Or + PhaseIs 조건 파싱", () => {
    const quest = parseRon(COMPLEX_COND_RON);
    expect(quest.transitions[1].when).toEqual({
      type: "Or",
      conditions: [
        { type: "HasItem", itemId: "y" },
        { type: "PhaseIs", quest: "q2", phase: "done" },
      ],
    });
  });

  it("Not 조건 파싱", () => {
    const quest = parseRon(COMPLEX_COND_RON);
    expect(quest.transitions[2].when).toEqual({ type: "Not", condition: { type: "HasItem", itemId: "z" } });
  });
});

describe("parseRon — transition 변형", () => {
  const TX_RON = `
#![enable(implicit_some)]
QuestDef(
    id: "tx_test",
    title: "전환 테스트",
    giver_npc: "NPC",
    initial_phase: "a",
    phases: {
        "a": QuestPhaseDef(dialog: [], objective: None),
        "b": QuestPhaseDef(dialog: [], objective: None),
    },
    transitions: [
        Transition(from: "a", trigger: Auto, when: HasItem("trigger"),
            actions: [DespawnWorldItem("world_obj")], to: "b"),
        Transition(from: "a", trigger: Interact,
            actions: [RemoveItem("old_item")], to: "a"),
    ],
    spawns: [],
)
`;

  it("Auto transition actions 파싱", () => {
    const quest = parseRon(TX_RON);
    expect(quest.transitions[0].actions).toEqual([{ type: "DespawnWorldItem", itemId: "world_obj" }]);
  });

  it("self-loop Interact transition (to == from) 파싱", () => {
    const quest = parseRon(TX_RON);
    const t = quest.transitions[1];
    expect(t.from).toBe("a");
    expect(t.to).toBe("a");
    expect(t.actions[0]).toEqual({ type: "RemoveItem", itemId: "old_item" });
  });

  it("when 을 Some() 으로 감싸도 파싱된다", () => {
    const src = `QuestDef(id:"t",title:"t",giver_npc:"n",initial_phase:"a",
      phases:{"a":QuestPhaseDef(dialog:[],objective:None),"b":QuestPhaseDef(dialog:[],objective:None)},
      transitions:[Transition(from:"a",trigger:Auto,when:Some(HasFlag("seen")),to:"b")],spawns:[])`;
    const quest = parseRon(src);
    expect(quest.transitions[0].when).toEqual({ type: "HasFlag", flag: "seen" });
  });
});

describe("serializeRon", () => {
  it("implicit_some directive 를 출력한다", () => {
    const quest = parseRon(SIMPLE_RON);
    const ron = serializeRon(quest);
    expect(ron).toContain("#![enable(implicit_some)]");
  });

  it("when 을 Some() 없이 bare 로 출력한다", () => {
    const quest = parseRon(SIMPLE_RON);
    const ron = serializeRon(quest);
    expect(ron).toContain(`when: HasItem("key_item")`);
  });

  it("직렬화 후 재파싱하면 동일 구조 반환", () => {
    const quest = parseRon(SIMPLE_RON);
    const reparsed = parseRon(serializeRon(quest));
    expect(reparsed.id).toBe(quest.id);
    expect(reparsed.title).toBe(quest.title);
    expect(reparsed.phases["dormant"].dialog).toEqual(quest.phases["dormant"].dialog);
    expect(reparsed.transitions).toEqual(quest.transitions);
    expect(reparsed.phases["done"].objective).toBeNull();
    expect(reparsed.spawns).toEqual(quest.spawns);
  });

  it("FlagIs 조건 직렬화/재파싱", () => {
    const quest: QuestDef = {
      id: "flag_test",
      title: "플래그 테스트",
      giverNpc: "NPC",
      initialPhase: "dormant",
      phases: {
        dormant: { dialog: [], objective: null },
        active: { dialog: [], objective: null },
      },
      transitions: [
        { from: "dormant", trigger: "Auto", when: { type: "FlagIs", flag: "character", value: "stark" }, actions: [], to: "active" },
      ],
      spawns: [],
    };
    const reparsed = parseRon(serializeRon(quest));
    expect(reparsed.transitions[0].when).toEqual({
      type: "FlagIs", flag: "character", value: "stark",
    });
  });

  it("순서형 transition (옛 Branch 대체) 직렬화/재파싱", () => {
    const quest: QuestDef = {
      id: "ordered",
      title: "순서형",
      giverNpc: "NPC",
      initialPhase: "a",
      phases: {
        a: { dialog: [], objective: null },
        b: { dialog: [], objective: null },
      },
      transitions: [
        {
          from: "a",
          trigger: "Interact",
          when: { type: "And", conditions: [{ type: "HasItem", itemId: "x" }, { type: "FlagIs", flag: "f", value: "v" }] },
          actions: [{ type: "RemoveItem", itemId: "x" }],
          to: "b",
        },
        { from: "a", trigger: "Interact", actions: [{ type: "Log", text: "실패" }], to: "a" },
      ],
      spawns: [],
    };
    const reparsed = parseRon(serializeRon(quest));
    expect(reparsed.transitions[0].when).toEqual({
      type: "And",
      conditions: [{ type: "HasItem", itemId: "x" }, { type: "FlagIs", flag: "f", value: "v" }],
    });
    expect(reparsed.transitions[0].to).toBe("b");
    expect(reparsed.transitions[1].when).toBeUndefined();
  });
});

describe("parseRon — 액션/조건 변형 (B1)", () => {
  function wrap(transitions: string, phases = `"a":QuestPhaseDef(dialog:[],objective:None),"b":QuestPhaseDef(dialog:[],objective:None)`) {
    return `QuestDef(id:"t",title:"t",giver_npc:"n",initial_phase:"a",
      phases:{${phases}},transitions:[${transitions}],spawns:[])`;
  }

  it("HasFlag 조건 파싱", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Auto,when:HasFlag("seen"),to:"b")`));
    expect(quest.transitions[0].when).toEqual({ type: "HasFlag", flag: "seen" });
  });

  it("GiveItems 액션 파싱", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[GiveItems(item:"potion",count:5)],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({ type: "GiveItems", itemId: "potion", count: 5 });
  });

  it("ClearFlag 액션 파싱", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[ClearFlag("flag1")],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({ type: "ClearFlag", flag: "flag1" });
  });

  it("OpenPortal 기본 (placement 생략) 파싱", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[OpenPortal(zone:"cave",generator:"bsp")],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({ type: "OpenPortal", zone: "cave", generator: "bsp" });
  });

  it("OpenPortal placement: Border 파싱", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[OpenPortal(zone:"glade",generator:"forest",placement:Border)],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({
      type: "OpenPortal", zone: "glade", generator: "forest", placement: { type: "Border" },
    });
  });

  it("OpenPortal placement: NearGiver(radius) 파싱", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[OpenPortal(zone:"z",generator:"g",placement:NearGiver(radius:5))],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({
      type: "OpenPortal", zone: "z", generator: "g", placement: { type: "NearGiver", radius: 5 },
    });
  });

  it("ClosePortal 액션 파싱", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[ClosePortal("cave")],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({ type: "ClosePortal", zone: "cave" });
  });

  it("SpawnGuards 액션 파싱 (count 필드)", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[SpawnGuards(count:6)],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({ type: "SpawnGuards", count: 6 });
  });

  it("PlaceTraps 액션 파싱 (kind enum / count / hidden)", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[PlaceTraps(kind:Alarm,count:4,hidden:true)],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({ type: "PlaceTraps", kind: "Alarm", count: 4, hidden: true });
  });

  it("PlaceTraps hidden 생략 시 기본값 true (serde default 미러)", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[PlaceTraps(kind:Spike,count:6)],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({ type: "PlaceTraps", kind: "Spike", count: 6, hidden: true });
  });

  it("PlaceTraps hidden:false 명시 파싱", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[PlaceTraps(kind:Poison,count:2,hidden:false)],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({ type: "PlaceTraps", kind: "Poison", count: 2, hidden: false });
  });

  it("PlaceTraps 필드 순서 무관 파싱", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[PlaceTraps(count:3,hidden:false,kind:Teleport)],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({ type: "PlaceTraps", kind: "Teleport", count: 3, hidden: false });
  });

  it("PlaceTraps 알 수 없는 kind 는 throw", () => {
    expect(() => parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[PlaceTraps(kind:Fire,count:1)],to:"b")`)))
      .toThrow(/Unknown trap kind/);
  });

  it("Explode 액션 파싱 (radius / terrain / entity_damage)", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[Explode(radius:4,terrain:true,entity_damage:8)],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({ type: "Explode", radius: 4, terrain: true, entityDamage: 8 });
  });

  it("SpawnMonster 액션 파싱 (id / count)", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[SpawnMonster(id:"frost_wyrm",count:1)],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({ type: "SpawnMonster", monsterId: "frost_wyrm", count: 1 });
  });

  it("InZone(Town) / InZone(Named) when 파싱", () => {
    const quest = parseRon(wrap(
      `Transition(from:"a",trigger:Auto,when:InZone(Town),to:"b"),Transition(from:"a",trigger:Auto,when:InZone(Named("herb_glade")),to:"b")`
    ));
    expect(quest.transitions[0].when).toEqual({ type: "InZone", zone: { type: "Town" } });
    expect(quest.transitions[1].when).toEqual({ type: "InZone", zone: { type: "Named", id: "herb_glade" } });
  });

  it("QuestSpawn count / condition 파싱", () => {
    const src = `QuestDef(id:"t",title:"t",giver_npc:"n",initial_phase:"a",
      phases:{"a":QuestPhaseDef(dialog:[],objective:None)},transitions:[],
      spawns:[
        QuestSpawn(phase:"a",item:"x",zone:Named("z"),count:3),
        QuestSpawn(phase:"a",item:"y",zone:Forest,condition:Some(HasFlag("f"))),
      ])`;
    const quest = parseRon(src);
    expect(quest.spawns[0]).toEqual({ phase: "a", item: "x", zone: { type: "Named", id: "z" }, count: 3 });
    expect(quest.spawns[1]).toEqual({ phase: "a", item: "y", zone: { type: "Forest" }, condition: { type: "HasFlag", flag: "f" } });
  });

  it("QuestDef.spawn_chance 파싱", () => {
    const src = `QuestDef(id:"t",title:"t",giver_npc:"n",initial_phase:"a",spawn_chance:0.7,
      phases:{"a":QuestPhaseDef(dialog:[],objective:None)},transitions:[],spawns:[])`;
    const quest = parseRon(src);
    expect(quest.spawnChance).toBeCloseTo(0.7);
  });
});

describe("serializeRon — 신규 변형 라운드트립", () => {
  it("HasFlag / GiveItems / ClearFlag / OpenPortal / ClosePortal / Named zone / spawn count·condition / spawn_chance / transitions", () => {
    const quest: QuestDef = {
      id: "rt", title: "rt", giverNpc: "n", initialPhase: "a",
      spawnChance: 0.5,
      phases: {
        a: { dialog: [], objective: null },
        b: { dialog: [], objective: null },
        c: { dialog: [], objective: null },
        d: { dialog: [], objective: null },
      },
      transitions: [
        {
          from: "a", trigger: "Interact", actions: [
            { type: "GiveItems", itemId: "potion", count: 5 },
            { type: "ClearFlag", flag: "f" },
            { type: "OpenPortal", zone: "z", generator: "bsp", placement: { type: "Border" } },
            { type: "OpenPortal", zone: "z2", generator: "forest", placement: { type: "NearGiver", radius: 3 } },
            { type: "OpenPortal", zone: "z3", generator: "bsp" },
            { type: "ClosePortal", zone: "z" },
          ], to: "b",
        },
        { from: "a", trigger: "Auto", when: { type: "HasFlag", flag: "x" }, actions: [], to: "b" },
        { from: "a", trigger: "Auto", when: { type: "InZone", zone: { type: "Named", id: "glade" } }, actions: [], to: "c" },
        { from: "a", trigger: "Auto", when: { type: "InZone", zone: { type: "Town" } }, actions: [], to: "d" },
      ],
      spawns: [
        { phase: "a", item: "x", zone: { type: "Named", id: "glade" }, count: 3 },
        { phase: "a", item: "y", zone: { type: "Town" }, condition: { type: "HasFlag", flag: "f" } },
      ],
    };
    const reparsed = parseRon(serializeRon(quest));
    expect(reparsed).toEqual(quest);
  });
});

describe("serializeRon — SpawnGuards 라운드트립", () => {
  it("SpawnGuards(count: N) 직렬화 후 재파싱하면 동일 구조 반환", () => {
    const quest: QuestDef = {
      id: "guard_quest", title: "잠입", giverNpc: "n", initialPhase: "a",
      phases: {
        a: { dialog: [], objective: null },
        b: { dialog: [], objective: null },
      },
      transitions: [
        {
          from: "a", trigger: "Interact",
          actions: [{ type: "SpawnGuards", count: 6 }],
          to: "b",
        },
      ],
      spawns: [],
    };
    const ron = serializeRon(quest);
    expect(ron).toContain("SpawnGuards(count: 6)");
    const reparsed = parseRon(ron);
    expect(reparsed).toEqual(quest);
  });
});

describe("serializeRon — PlaceTraps / Explode / SpawnMonster 라운드트립", () => {
  it("3종 액션 직렬화 후 재파싱하면 동일 구조 반환 (게임 RON 문법 호환)", () => {
    const quest: QuestDef = {
      id: "new_actions", title: "신규 액션", giverNpc: "n", initialPhase: "a",
      phases: {
        a: { dialog: [], objective: null },
        b: { dialog: [], objective: null },
      },
      transitions: [
        {
          from: "a", trigger: "Interact",
          actions: [
            { type: "PlaceTraps", kind: "Alarm", count: 4, hidden: true },
            { type: "PlaceTraps", kind: "Spike", count: 6, hidden: false },
            { type: "Explode", radius: 4, terrain: true, entityDamage: 8 },
            { type: "SpawnMonster", monsterId: "frost_wyrm", count: 1 },
          ],
          to: "b",
        },
      ],
      spawns: [],
    };
    const ron = serializeRon(quest);
    // 게임이 export 하는 표기와 정확히 일치하는지 확인
    expect(ron).toContain("PlaceTraps(kind: Alarm, count: 4, hidden: true)");
    expect(ron).toContain("PlaceTraps(kind: Spike, count: 6, hidden: false)");
    expect(ron).toContain("Explode(radius: 4, terrain: true, entity_damage: 8)");
    expect(ron).toContain(`SpawnMonster(id: "frost_wyrm", count: 1)`);
    const reparsed = parseRon(ron);
    expect(reparsed).toEqual(quest);
  });

  it("bevy-rogue assets 미러 — 게임 .ron 의 액션 라인을 import→재export 하면 동일", () => {
    // 실제 assets/quests/*.ron 에서 그대로 가져온 액션 라인들
    const src = `QuestDef(id:"m",title:"m",giver_npc:"n",initial_phase:"a",
      phases:{"a":QuestPhaseDef(dialog:[],objective:None),"b":QuestPhaseDef(dialog:[],objective:None)},
      transitions:[Transition(from:"a",trigger:Interact,actions:[
        SpawnGuards(count: 5),
        PlaceTraps(kind: Alarm, count: 4, hidden: true),
        PlaceTraps(kind: Spike, count: 6, hidden: true),
        PlaceTraps(kind: Poison, count: 4, hidden: true),
        Explode(radius: 4, terrain: true, entity_damage: 8),
        SpawnMonster(id: "frost_wyrm", count: 1),
        SpawnMonster(id: "troll", count: 2),
      ],to:"b")],spawns:[])`;
    const quest = parseRon(src);
    // import 후 재export → 재import 라운드트립 정합성
    expect(parseRon(serializeRon(quest))).toEqual(quest);
    // 액션 구조 확인
    expect(quest.transitions[0].actions).toEqual([
      { type: "SpawnGuards", count: 5 },
      { type: "PlaceTraps", kind: "Alarm", count: 4, hidden: true },
      { type: "PlaceTraps", kind: "Spike", count: 6, hidden: true },
      { type: "PlaceTraps", kind: "Poison", count: 4, hidden: true },
      { type: "Explode", radius: 4, terrain: true, entityDamage: 8 },
      { type: "SpawnMonster", monsterId: "frost_wyrm", count: 1 },
      { type: "SpawnMonster", monsterId: "troll", count: 2 },
    ]);
  });
});

describe("serializeRon — Always 조건", () => {
  it("Always 조건은 And([]) 로 직렬화되어 Rust가 파싱 가능한 형태를 출력한다", () => {
    const quest: QuestDef = {
      id: "t", title: "t", giverNpc: "", initialPhase: "a",
      phases: { a: { dialog: [], objective: null }, b: { dialog: [], objective: null } },
      transitions: [
        { from: "a", trigger: "Interact", when: { type: "Always" }, actions: [{ type: "Log", text: "yes" }], to: "b" },
      ],
      spawns: [],
    };
    const ron = serializeRon(quest);
    expect(ron).toContain("And([])");
    expect(ron).not.toContain("Always");
  });
});

describe("parseVillagersRon — 기본", () => {
  const SIMPLE = `[
    VillagerDef(
        id: "elder",
        name: "장로",
        color: (0.9, 0.8, 0.5),
        dialogs: [],
        speed: 0.5,
    ),
    VillagerDef(
        id: "burgomaster",
        name: "촌장",
        color: (1.0, 0.85, 0.0),
        dialogs: [
            "안녕",
            "잘 가게.",
        ],
        speed: 1.0,
    ),
]`;

  it("VillagerDef 2개 파싱", () => {
    const villagers = parseVillagersRon(SIMPLE);
    expect(villagers).toHaveLength(2);
    expect(villagers[0]).toEqual({
      id: "elder",
      name: "장로",
      color: [0.9, 0.8, 0.5],
      dialogs: [],
      speed: 0.5,
    });
    expect(villagers[1]).toEqual({
      id: "burgomaster",
      name: "촌장",
      color: [1.0, 0.85, 0.0],
      dialogs: ["안녕", "잘 가게."],
      speed: 1.0,
    });
  });

  it("구 형식의 quest_id 는 소비 후 무시된다 (하위호환)", () => {
    const old = `[VillagerDef(id: "elder", name: "장로", color: (0.9, 0.8, 0.5), dialogs: [], quest_id: Some("gem_quest"), speed: 0.5)]`;
    const villagers = parseVillagersRon(old);
    expect(villagers[0]).toEqual({
      id: "elder", name: "장로", color: [0.9, 0.8, 0.5], dialogs: [], speed: 0.5,
    });
    expect("questId" in villagers[0]).toBe(false);
  });

  it("빈 배열 파싱", () => {
    expect(parseVillagersRon("[]")).toEqual([]);
  });

  it("라운드트립 deep equal", () => {
    const villagers = parseVillagersRon(SIMPLE);
    const reparsed = parseVillagersRon(serializeVillagersRon(villagers));
    expect(reparsed).toEqual(villagers);
  });
});

describe("serializeVillagersRon — 빈 배열", () => {
  it("빈 배열은 \"[]\\n\"", () => {
    expect(serializeVillagersRon([])).toBe("[]\n");
  });

  it("id 를 출력하고 quest_id 는 출력하지 않는다", () => {
    const villagers: VillagerDef[] = [
      { id: "a", name: "에이", color: [0, 0, 0], dialogs: [], speed: 1.0 },
    ];
    const out = serializeVillagersRon(villagers);
    expect(out).toContain('id: "a"');
    expect(out).not.toContain("quest_id");
  });
});

describe("parse/serialize QuestItemsRon", () => {
  const SRC = `[
    QuestItemDef(
        id: "eternal_gem",
        display_name: "영원의 보석",
        glyph_ascii: "*",
        glyph_unicode: "◆",
        glyph_game_icon: "◆",
        pickup_message: "영원의 보석을 획득했다!",
        image_path: "scene/open-chest.png",
    ),
]`;

  it("파싱 + 라운드트립", () => {
    const items = parseQuestItemsRon(SRC);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      kind: "quest",
      id: "eternal_gem",
      displayName: "영원의 보석",
      glyphAscii: "*", glyphUnicode: "◆", glyphGameIcon: "◆",
      pickupMessage: "영원의 보석을 획득했다!",
      imagePath: "scene/open-chest.png",
    });
    const reparsed = parseQuestItemsRon(serializeQuestItemsRon(items));
    expect(reparsed).toEqual(items);
  });

  it("빈 배열 직렬화", () => {
    expect(serializeQuestItemsRon([])).toBe("[]\n");
  });
});

describe("parse/serialize WeaponsRon — 신규 random-stat 필드 (게임 RON 형식)", () => {
  // bevy-rogue 의 assets/items/weapons.ron 미러 — attack_power_min/max + tier
  const NEW_SRC = `[
    WeaponDef(
        id: "dagger",
        display_name: "단검",
        glyph_ascii: "/",
        glyph_unicode: "X",
        glyph_game_icon: "X",
        pickup_message: "단검을 획득했다!",
        attack_power_min: 3,
        attack_power_max: 6,
        tier: 1,
        element: None,
    ),
    WeaponDef(
        id: "sword",
        display_name: "검",
        glyph_ascii: "/",
        glyph_unicode: "X",
        glyph_game_icon: "X",
        pickup_message: "검을 획득했다!",
        attack_power_min: 5,
        attack_power_max: 9,
        tier: 1,
        element: Some("fire"),
    ),
]`;

  it("attack_power_min/max + tier 를 파싱하고 attackPower 는 평균으로 추론", () => {
    const weapons = parseWeaponsRon(NEW_SRC);
    expect(weapons[0].attackPowerMin).toBe(3);
    expect(weapons[0].attackPowerMax).toBe(6);
    expect(weapons[0].tier).toBe(1);
    expect(weapons[0].attackPower).toBe(5); // round((3+6)/2)=5 (Math.round 사용)
    expect(weapons[1].element).toBe("fire");
    expect(weapons[1].tier).toBe(1);
  });

  it("라운드트립: random-stat 모드는 min/max + tier 로 직렬화", () => {
    const weapons = parseWeaponsRon(NEW_SRC);
    const out = serializeWeaponsRon(weapons);
    expect(out).toContain("attack_power_min: 3");
    expect(out).toContain("attack_power_max: 6");
    expect(out).toContain("tier: 1");
    // 단일값 라인은 출력되지 않아야 함 (random-stat 모드)
    expect(out).not.toMatch(/^\s*attack_power:\s/m);
    const reparsed = parseWeaponsRon(out);
    expect(reparsed).toEqual(weapons);
  });
});

describe("parse/serialize ArmorsRon — 신규 random-stat 필드", () => {
  const NEW_SRC = `[
    ArmorDef(
        id: "cloth_armor",
        display_name: "천 갑옷",
        glyph_ascii: "]",
        glyph_unicode: "X",
        glyph_game_icon: "X",
        pickup_message: "천 갑옷을 획득했다!",
        defense_bonus_min: 1,
        defense_bonus_max: 2,
        tier: 1,
    ),
]`;

  it("defense_bonus_min/max + tier 파싱 + 라운드트립 (random-stat 모드)", () => {
    const armors = parseArmorsRon(NEW_SRC);
    expect(armors[0].defenseBonusMin).toBe(1);
    expect(armors[0].defenseBonusMax).toBe(2);
    expect(armors[0].tier).toBe(1);
    const out = serializeArmorsRon(armors);
    expect(out).toContain("defense_bonus_min: 1");
    expect(out).toContain("defense_bonus_max: 2");
    expect(out).toContain("tier: 1");
    expect(out).not.toMatch(/^\s*defense_bonus:\s/m);
    expect(parseArmorsRon(out)).toEqual(armors);
  });
});

describe("parseVillagersRon — stationary / vendor 신규 필드", () => {
  const SRC = `[
    VillagerDef(
        id: "merchant",
        name: "상인",
        color: (0.3, 0.9, 0.3),
        stationary: true,
        vendor: true,
        dialogs: [],
        speed: 1.0,
    ),
    VillagerDef(
        id: "elder",
        name: "장로",
        color: (0.9, 0.8, 0.5),
        dialogs: [],
        speed: 0.5,
    ),
]`;

  it("stationary / vendor 파싱", () => {
    const villagers = parseVillagersRon(SRC);
    expect(villagers[0].stationary).toBe(true);
    expect(villagers[0].vendor).toBe(true);
    // 미지정은 undefined (또는 false 와 동등)
    expect(villagers[1].stationary ?? false).toBe(false);
    expect(villagers[1].vendor ?? false).toBe(false);
  });

  it("라운드트립: true 만 출력, false/미지정은 생략", () => {
    const villagers = parseVillagersRon(SRC);
    const out = serializeVillagersRon(villagers);
    expect(out).toContain("stationary: true");
    expect(out).toContain("vendor: true");
    // 두 번째 villager 줄에는 stationary/vendor 라인이 없어야 함
    const elderBlock = out.slice(out.indexOf("elder"));
    expect(elderBlock).not.toContain("stationary");
    expect(elderBlock).not.toContain("vendor");
    // 라운드트립 정합
    expect(parseVillagersRon(out)).toEqual(villagers);
  });
});

describe("parse/serialize WeaponsRon", () => {
  const SRC = `[
    WeaponDef(
        id: "sword",
        display_name: "검",
        glyph_ascii: "/",
        glyph_unicode: "X",
        glyph_game_icon: "X",
        pickup_message: "검 획득",
        attack_power: 7,
        element: Some("fire"),
    ),
    WeaponDef(
        id: "knife",
        display_name: "단검",
        glyph_ascii: "/",
        glyph_unicode: "X",
        glyph_game_icon: "X",
        pickup_message: "단검 획득",
        attack_power: 3,
        element: None,
    ),
]`;

  it("Some/None element 파싱 + 라운드트립", () => {
    const weapons = parseWeaponsRon(SRC);
    expect(weapons).toHaveLength(2);
    expect(weapons[0].element).toBe("fire");
    expect(weapons[1].element).toBeNull();
    const reparsed = parseWeaponsRon(serializeWeaponsRon(weapons));
    expect(reparsed).toEqual(weapons);
  });

  it("element 직렬화 — null 은 None, 값은 Some", () => {
    const out = serializeWeaponsRon(parseWeaponsRon(SRC));
    expect(out).toContain('element: Some("fire")');
    expect(out).toContain("element: None");
  });

  it("알 수 없는 element 는 throw", () => {
    const bad = `[WeaponDef(id:"x",display_name:"",glyph_ascii:"",glyph_unicode:"",glyph_game_icon:"",pickup_message:"",attack_power:1,element:Some("plasma"))]`;
    expect(() => parseWeaponsRon(bad)).toThrow(/Unknown element/);
  });
});

describe("parse/serialize ArmorsRon", () => {
  const SRC = `[
    ArmorDef(
        id: "leather_armor",
        display_name: "가죽 갑옷",
        glyph_ascii: "]",
        glyph_unicode: "X",
        glyph_game_icon: "X",
        pickup_message: "가죽 갑옷 획득",
        defense_bonus: 2,
    ),
]`;

  it("파싱 + 라운드트립", () => {
    const armors = parseArmorsRon(SRC);
    expect(armors[0].defenseBonus).toBe(2);
    expect(parseArmorsRon(serializeArmorsRon(armors))).toEqual(armors);
  });
});

describe("parse/serialize ConsumablesRon", () => {
  const SRC = `[
    ConsumableDef(
        id: "health_potion",
        display_name: "체력 물약",
        glyph_ascii: "!",
        glyph_unicode: "❤",
        glyph_game_icon: "❤",
        pickup_message: "물약 획득",
        effect: Heal(8),
    ),
]`;

  it("Heal(amount) effect 파싱 + 라운드트립", () => {
    const consumables = parseConsumablesRon(SRC);
    expect(consumables[0].effect).toEqual({ type: "Heal", amount: 8 });
    const reparsed = parseConsumablesRon(serializeConsumablesRon(consumables));
    expect(reparsed).toEqual(consumables);
  });

  it("Heal 외 effect 는 throw", () => {
    const bad = `[ConsumableDef(id:"x",display_name:"",glyph_ascii:"",glyph_unicode:"",glyph_game_icon:"",pickup_message:"",effect:Burn(3))]`;
    expect(() => parseConsumablesRon(bad)).toThrow(/Unknown consumable effect/);
  });
});

describe("parse/serialize MonstersRon — 기본 (실제 monsters.ron 형식)", () => {
  // bevy-rogue 의 assets/monsters/monsters.ron 미러
  const SRC = `[
    MonsterDef(
        id: "goblin",
        display_name: "고블린",
        glyph: "g",
        color: (0.2, 0.8, 0.2),
        hp: 6,
        attack: 3,
        defense: 0,
        vision_radius: 6,
        speed: 1.5,
        element: Some("poison"),
        spawn_weight: 1.0,
        zones: [],
        spawn_condition: None,
        quest_only: false,
    ),
    MonsterDef(
        id: "orc",
        display_name: "오크",
        glyph: "O",
        color: (0.9, 0.5, 0.1),
        hp: 10,
        attack: 5,
        defense: 2,
        vision_radius: 8,
        speed: 1.0,
        element: Some("fire"),
        spawn_weight: 1.0,
        zones: [],
        spawn_condition: None,
        quest_only: false,
    ),
]`;

  it("MonsterDef 2개 파싱", () => {
    const monsters = parseMonstersRon(SRC);
    expect(monsters).toHaveLength(2);
    expect(monsters[0]).toEqual({
      id: "goblin",
      displayName: "고블린",
      glyph: "g",
      color: [0.2, 0.8, 0.2],
      hp: 6,
      attack: 3,
      defense: 0,
      visionRadius: 6,
      speed: 1.5,
      element: "poison",
      spawnWeight: 1.0,
      zones: [],
      questOnly: false,
    });
    // element: fire / glyph 대문자도 보존
    expect(monsters[1].element).toBe("fire");
    expect(monsters[1].glyph).toBe("O");
    // spawn_condition: None 은 키가 없어야 한다 (undefined)
    expect("spawnCondition" in monsters[0]).toBe(false);
  });

  it("빈 배열 파싱", () => {
    expect(parseMonstersRon("[]")).toEqual([]);
  });

  it("라운드트립 deep equal", () => {
    const monsters = parseMonstersRon(SRC);
    const reparsed = parseMonstersRon(serializeMonstersRon(monsters));
    expect(reparsed).toEqual(monsters);
  });

  it("빈 배열 직렬화", () => {
    expect(serializeMonstersRon([])).toBe("[]\n");
  });
});

describe("parse/serialize MonstersRon — zones·중첩 spawn_condition·quest_only", () => {
  // quest_only 보스 + zones(ZoneId 변형) + 중첩 And/Or/Not/HasFlag/PhaseIs 조건
  const SRC = `[
    MonsterDef(
        id: "shadow_lord",
        display_name: "그림자 군주",
        glyph: "L",
        color: (0.1, 0.0, 0.2),
        hp: 40,
        attack: 12,
        defense: 5,
        vision_radius: 10,
        speed: 0.8,
        element: Some("lightning"),
        spawn_weight: 0.5,
        zones: [Dungeon(3), Forest, Named("desert")],
        spawn_condition: Some(And([
            HasFlag("boss_unlocked"),
            Not(PhaseIs(quest: "main", phase: "done")),
            Or([InZone(Town), HasItem("key")]),
        ])),
        quest_only: true,
    ),
]`;

  it("zones (Dungeon/Forest/Named) 와 중첩 조건을 파싱", () => {
    const monsters = parseMonstersRon(SRC);
    expect(monsters[0].zones).toEqual([
      { type: "Dungeon", level: 3 },
      { type: "Forest" },
      { type: "Named", id: "desert" },
    ]);
    expect(monsters[0].questOnly).toBe(true);
    expect(monsters[0].spawnWeight).toBe(0.5);
    expect(monsters[0].spawnCondition).toEqual({
      type: "And",
      conditions: [
        { type: "HasFlag", flag: "boss_unlocked" },
        { type: "Not", condition: { type: "PhaseIs", quest: "main", phase: "done" } },
        {
          type: "Or",
          conditions: [
            { type: "InZone", zone: { type: "Town" } },
            { type: "HasItem", itemId: "key" },
          ],
        },
      ],
    });
  });

  it("zones·중첩 조건·quest_only 라운드트립", () => {
    const monsters = parseMonstersRon(SRC);
    const reparsed = parseMonstersRon(serializeMonstersRon(monsters));
    expect(reparsed).toEqual(monsters);
  });

  it("element None 과 spawn_condition None 직렬화", () => {
    const m: MonsterDef = {
      id: "slime",
      displayName: "슬라임",
      glyph: "s",
      color: [0, 0.5, 0],
      hp: 3,
      attack: 1,
      defense: 0,
      visionRadius: 4,
      speed: 1.0,
      element: null,
      spawnWeight: 2.0,
      zones: [],
      questOnly: false,
    };
    const out = serializeMonstersRon([m]);
    expect(out).toContain("element: None");
    expect(out).toContain("spawn_condition: None");
    expect(out).toContain("quest_only: false");
    expect(out).not.toContain("Some(");
    // 라운드트립으로 정합성 확인
    expect(parseMonstersRon(out)).toEqual([m]);
  });

  it("알 수 없는 element 는 throw", () => {
    const bad = `[MonsterDef(id:"x",display_name:"",glyph:"x",color:(0,0,0),hp:1,attack:0,defense:0,vision_radius:1,speed:1.0,element:Some("holy"),spawn_weight:1.0,zones:[],spawn_condition:None,quest_only:false)]`;
    expect(() => parseMonstersRon(bad)).toThrow(/Unknown monster element/);
  });
});


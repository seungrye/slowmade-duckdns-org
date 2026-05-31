import { describe, it, expect } from "vitest";
import {
  parseRon, serializeRon,
  parseVillagersRon, serializeVillagersRon,
  parseQuestItemsRon, serializeQuestItemsRon,
  parseWeaponsRon, serializeWeaponsRon,
  parseArmorsRon, serializeArmorsRon,
  parseConsumablesRon, serializeConsumablesRon,
  parseAccessoriesRon, serializeAccessoriesRon,
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

  it("spawns 파싱 (옛 Dungeon(N) → Named('dungeon_N') 자동 변환)", () => {
    const quest = parseRon(SIMPLE_RON);
    expect(quest.spawns).toHaveLength(1);
    expect(quest.spawns[0]).toEqual({ phase: "active", item: "key_item", zone: { type: "Named", id: "dungeon_1" } });
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

  it("OpenZonePortal — 옛 MountainVillage 텍스트가 Named('mountain_village') 로 호환 파싱", () => {
    // 옛 RON 의 정적 variant 명도 파서가 새 schema Named id 로 자동 변환.
    const quest = parseRon(wrap(
      `Transition(from:"a",trigger:Interact,actions:[OpenZonePortal(target:MountainVillage)],to:"b")`,
    ));
    expect(quest.transitions[0].actions[0]).toEqual({
      type: "OpenZonePortal", target: { type: "Named", id: "mountain_village" },
    });
  });

  it("OpenZonePortal — 옛 SeasideHarbor + placement: NearGiver 파싱", () => {
    const quest = parseRon(wrap(
      `Transition(from:"a",trigger:Interact,actions:[OpenZonePortal(target:SeasideHarbor,placement:NearGiver(radius:4))],to:"b")`,
    ));
    expect(quest.transitions[0].actions[0]).toEqual({
      type: "OpenZonePortal",
      target: { type: "Named", id: "seaside_harbor" },
      placement: { type: "NearGiver", radius: 4 },
    });
  });

  it("OpenZonePortal — 옛 Dungeon(N) 도 Named('dungeon_N') 로 / Named target 그대로", () => {
    const a = parseRon(wrap(
      `Transition(from:"a",trigger:Interact,actions:[OpenZonePortal(target:Dungeon(3))],to:"b")`,
    ));
    expect(a.transitions[0].actions[0]).toEqual({
      type: "OpenZonePortal", target: { type: "Named", id: "dungeon_3" },
    });
    const b = parseRon(wrap(
      `Transition(from:"a",trigger:Interact,actions:[OpenZonePortal(target:Named("herb_glade"))],to:"b")`,
    ));
    expect(b.transitions[0].actions[0]).toEqual({
      type: "OpenZonePortal", target: { type: "Named", id: "herb_glade" },
    });
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

  it("SpawnGuards 액션 파싱 (zone: Some(Named) 지정 → deferred 큐 의도)", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[SpawnGuards(count:5,zone:Some(Named("infiltration")))],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({
      type: "SpawnGuards", count: 5, zone: { type: "Named", id: "infiltration" },
    });
  });

  it("SpawnGuards 액션 파싱 (zone: None → undefined)", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[SpawnGuards(count:5,zone:None)],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({ type: "SpawnGuards", count: 5 });
  });

  it("PlaceTraps 액션 파싱 (zone: Some(Named) deferred)", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[PlaceTraps(kind:Alarm,count:4,hidden:true,zone:Some(Named("infiltration")))],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({
      type: "PlaceTraps", kind: "Alarm", count: 4, hidden: true,
      zone: { type: "Named", id: "infiltration" },
    });
  });

  it("SpawnMonster 액션 파싱 (zone: Some(Named) deferred)", () => {
    const quest = parseRon(wrap(`Transition(from:"a",trigger:Interact,actions:[SpawnMonster(id:"frost_wyrm",count:1,zone:Some(Named("wyrm_lair")))],to:"b")`));
    expect(quest.transitions[0].actions[0]).toEqual({
      type: "SpawnMonster", monsterId: "frost_wyrm", count: 1,
      zone: { type: "Named", id: "wyrm_lair" },
    });
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
    // 옛 Forest 텍스트는 새 schema 의 Named('forest') 로 자동 흡수된다.
    expect(quest.spawns[1]).toEqual({ phase: "a", item: "y", zone: { type: "Named", id: "forest" }, condition: { type: "HasFlag", flag: "f" } });
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

  it("zone 인자가 있는 spawn 액션은 라운드트립을 보존한다(deferred 의도)", () => {
    // infiltration/vault_heist/trap_mine/dragon_hunt 의 신규 형식 — zone:Some(Named).
    const quest: QuestDef = {
      id: "z", title: "z", giverNpc: "n", initialPhase: "a",
      phases: {
        a: { dialog: [], objective: null },
        b: { dialog: [], objective: null },
      },
      transitions: [
        {
          from: "a", trigger: "Interact",
          actions: [
            { type: "SpawnGuards", count: 5, zone: { type: "Named", id: "infiltration" } },
            { type: "PlaceTraps", kind: "Alarm", count: 4, hidden: true,
              zone: { type: "Named", id: "infiltration" } },
            { type: "SpawnMonster", monsterId: "frost_wyrm", count: 1,
              zone: { type: "Named", id: "wyrm_lair" } },
          ],
          to: "b",
        },
      ],
      spawns: [],
    };
    const ron = serializeRon(quest);
    // 직렬화 표기 확인 — `zone: Some(Named("…"))`.
    expect(ron).toContain(`SpawnGuards(count: 5, zone: Some(Named("infiltration")))`);
    expect(ron).toContain(`zone: Some(Named("infiltration"))`);
    expect(ron).toContain(`SpawnMonster(id: "frost_wyrm", count: 1, zone: Some(Named("wyrm_lair")))`);
    // 라운드트립 보존.
    expect(parseRon(ron)).toEqual(quest);
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
      glyphAscii: "*", glyphGameIcon: "◆",
      pickupMessage: "영원의 보석을 획득했다!",
      imagePath: "scene/open-chest.png",
    });
    const reparsed = parseQuestItemsRon(serializeQuestItemsRon(items));
    expect(reparsed).toEqual(items);
  });

  it("빈 배열 직렬화", () => {
    expect(serializeQuestItemsRon([])).toBe("[]\n");
  });

  it("glyph_game_icon 의 \\u{XXXXX} escape 가 실제 PUA 코드포인트로 디코드된다", () => {
    // 게임 RON 은 game-icons.net PUA codepoint (U+FF000~U+100005) 를 \u{FF23C}
    // 형식으로 기록한다. 사이트 파서가 이를 단일 PUA 문자로 정확히 복원해야 한다.
    // 옛 glyph_unicode 키도 silently 흡수해 캐시된 RON 호환을 보장한다.
    const src = `[
      QuestItemDef(
          id: "x", display_name: "x", glyph_ascii: "/",
          glyph_unicode: "\\u{E946}",
          glyph_game_icon: "\\u{FFAFD}",
          pickup_message: "p", image_path: "x.png",
      ),
    ]`;
    const items = parseQuestItemsRon(src);
    expect(items[0].glyphGameIcon).toBe("\u{FFAFD}");
    // Supplementary plane PUA 는 UTF-16 surrogate pair 1쌍 (length=2) 이지만
    // codepoint 는 단일.
    expect([...items[0].glyphGameIcon]).toHaveLength(1);
  });

  it("직렬화 시 PUA codepoint 는 \\u{XXXXX} escape 로 출력된다 (round-trip)", () => {
    const items = parseQuestItemsRon(`[
      QuestItemDef(
          id: "x", display_name: "x", glyph_ascii: "/",
          glyph_game_icon: "\\u{FFAFD}",
          pickup_message: "p", image_path: "x.png",
      ),
    ]`);
    const out = serializeQuestItemsRon(items);
    expect(out).toContain('glyph_game_icon: "\\u{FFAFD}"');
    expect(parseQuestItemsRon(out)).toEqual(items);
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

describe("parseVillagersRon — home_zone (마을 분산)", () => {
  // 새 schema: Town | Named. 옛 RON 의 bare ident(MountainVillage/SeasideHarbor)
  // 도 호환되어 Named 로 자동 변환된다.
  const SRC = `[
    VillagerDef(
        id: "burgomaster",
        name: "촌장",
        color: (1.0, 0.85, 0.0),
        dialogs: [],
        speed: 1.0,
        home_zone: Town,
    ),
    VillagerDef(
        id: "huntmaster",
        name: "수렵단장",
        color: (0.70, 0.30, 0.25),
        dialogs: [],
        speed: 0.6,
        home_zone: MountainVillage,
    ),
    VillagerDef(
        id: "battlemage",
        name: "전투마법사",
        color: (0.55, 0.35, 0.85),
        dialogs: [],
        speed: 0.6,
        home_zone: SeasideHarbor,
    ),
    VillagerDef(
        id: "elder",
        name: "장로",
        color: (0.9, 0.8, 0.5),
        dialogs: [],
        speed: 0.5,
    ),
]`;

  it("옛 MountainVillage / SeasideHarbor 표기는 Named 로 변환되어 파싱", () => {
    const v = parseVillagersRon(SRC);
    expect(v[0].homeZone).toEqual({ type: "Town" });
    expect(v[1].homeZone).toEqual({ type: "Named", id: "mountain_village" });
    expect(v[2].homeZone).toEqual({ type: "Named", id: "seaside_harbor" });
    // 마지막 elder 는 home_zone 필드 자체가 없는 RON — TS 상 undefined.
    // 게임 측 #[serde(default)] 미러: 마이그레이션/DB 에서 Town 으로 보정된다.
    expect(v[3].homeZone).toBeUndefined();
  });

  it("라운드트립: 기본 Town 은 생략, 그 외는 Named 로 명시 출력", () => {
    const v = parseVillagersRon(SRC);
    const out = serializeVillagersRon(v);
    expect(out).toContain('home_zone: Named("mountain_village")');
    expect(out).toContain('home_zone: Named("seaside_harbor")');
    // Town 은 default 라 출력 생략 (호환을 위해 기존 RON 텍스트 모양 유지).
    const burgoBlock = out.slice(out.indexOf("burgomaster"), out.indexOf("huntmaster"));
    expect(burgoBlock).not.toContain("home_zone:");
    // 라운드트립 — parse → serialize → parse 했을 때 Town 의 명시/생략 차이는 의도된 lossy.
    // 정규화 후 동치를 보장: Town 명시는 parse 결과에서 homeZone 키가 유지되지만,
    // serialize 가 생략하므로 두 번째 parse 에서는 키 자체가 없다. 두 값을 정규화 비교.
    const normalize = (defs: ReturnType<typeof parseVillagersRon>) =>
      defs.map((d) => {
        const { homeZone, ...rest } = d;
        const isDefault = !homeZone || homeZone.type === "Town";
        return isDefault ? rest : { ...rest, homeZone };
      });
    expect(normalize(parseVillagersRon(out))).toEqual(normalize(v));
  });
});

describe("parseVillagersRon — home_landmark (Town 안 spawn 위치)", () => {
  // 새 필드: HomeLandmark enum — Random(기본) / Road / 6 landmark.
  // 게임 측 #[serde(default)] 와 동일 — 누락 시 undefined, Random 명시 시도 호환.
  const SRC = `[
    VillagerDef(
        id: "innkeeper",
        name: "여관 주인",
        color: (0.8, 0.6, 0.3),
        dialogs: [],
        speed: 1.0,
        home_landmark: Inn,
    ),
    VillagerDef(
        id: "guard_captain",
        name: "초소장",
        color: (0.5, 0.5, 0.6),
        dialogs: [],
        speed: 1.0,
        home_landmark: Guard,
    ),
    VillagerDef(
        id: "wanderer",
        name: "방랑자",
        color: (0.4, 0.4, 0.4),
        dialogs: [],
        speed: 1.0,
        home_landmark: Road,
    ),
    VillagerDef(
        id: "burgomaster",
        name: "촌장",
        color: (1.0, 0.85, 0.0),
        dialogs: [],
        speed: 1.0,
        home_landmark: Random,
    ),
    VillagerDef(
        id: "elder",
        name: "장로",
        color: (0.9, 0.8, 0.5),
        dialogs: [],
        speed: 0.5,
    ),
  ]`;

  it("PascalCase enum 을 lowercase TS 값으로 파싱", () => {
    const v = parseVillagersRon(SRC);
    expect(v[0].homeLandmark).toBe("inn");
    expect(v[1].homeLandmark).toBe("guard");
    expect(v[2].homeLandmark).toBe("road");
    expect(v[3].homeLandmark).toBe("random");
    // 미지정 → undefined (게임 측 #[serde(default)] 미러 — DB 에서 "random" 보정)
    expect(v[4].homeLandmark).toBeUndefined();
  });

  it("라운드트립: 기본 Random 은 생략, 6 landmark + Road 는 PascalCase 명시", () => {
    const v = parseVillagersRon(SRC);
    const out = serializeVillagersRon(v);
    expect(out).toContain("home_landmark: Inn");
    expect(out).toContain("home_landmark: Guard");
    expect(out).toContain("home_landmark: Road");
    // Random 은 default 라 출력 생략
    const burgoBlock = out.slice(out.indexOf("burgomaster"), out.indexOf("elder"));
    expect(burgoBlock).not.toContain("home_landmark");
    // elder 도 미지정이므로 출력 없음
    const elderBlock = out.slice(out.indexOf("elder"));
    expect(elderBlock).not.toContain("home_landmark");
    // 정규화 라운드트립 — Random/undefined 동치 처리
    const normalize = (defs: ReturnType<typeof parseVillagersRon>) =>
      defs.map((d) => {
        const { homeLandmark, ...rest } = d;
        const isDefault = !homeLandmark || homeLandmark === "random";
        return isDefault ? rest : { ...rest, homeLandmark };
      });
    expect(normalize(parseVillagersRon(out))).toEqual(normalize(v));
  });

  it("알 수 없는 home_landmark 는 throw", () => {
    const bad = `[VillagerDef(id:"x",name:"x",color:(0,0,0),dialogs:[],speed:1.0,home_landmark:Castle)]`;
    expect(() => parseVillagersRon(bad)).toThrow(/Unknown home_landmark/);
  });

  it("6 landmark 모두 직렬화/재파싱 round-trip", () => {
    const v: VillagerDef[] = [
      { id: "a", name: "a", color: [0, 0, 0], dialogs: [], speed: 1.0, homeLandmark: "inn" },
      { id: "b", name: "b", color: [0, 0, 0], dialogs: [], speed: 1.0, homeLandmark: "smithy" },
      { id: "c", name: "c", color: [0, 0, 0], dialogs: [], speed: 1.0, homeLandmark: "temple" },
      { id: "d", name: "d", color: [0, 0, 0], dialogs: [], speed: 1.0, homeLandmark: "guard" },
      { id: "e", name: "e", color: [0, 0, 0], dialogs: [], speed: 1.0, homeLandmark: "market" },
      { id: "f", name: "f", color: [0, 0, 0], dialogs: [], speed: 1.0, homeLandmark: "manor" },
    ];
    const out = serializeVillagersRon(v);
    expect(out).toContain("home_landmark: Inn");
    expect(out).toContain("home_landmark: Smithy");
    expect(out).toContain("home_landmark: Temple");
    expect(out).toContain("home_landmark: Guard");
    expect(out).toContain("home_landmark: Market");
    expect(out).toContain("home_landmark: Manor");
    expect(parseVillagersRon(out)).toEqual(v);
  });

  it("신규 7 landmark (Tavern/Herbalist/Graveyard/Jail/Guild/Alchemist/Docks) round-trip", () => {
    const v: VillagerDef[] = [
      { id: "a", name: "a", color: [0, 0, 0], dialogs: [], speed: 1.0, homeLandmark: "tavern" },
      { id: "b", name: "b", color: [0, 0, 0], dialogs: [], speed: 1.0, homeLandmark: "herbalist" },
      { id: "c", name: "c", color: [0, 0, 0], dialogs: [], speed: 1.0, homeLandmark: "graveyard" },
      { id: "d", name: "d", color: [0, 0, 0], dialogs: [], speed: 1.0, homeLandmark: "jail" },
      { id: "e", name: "e", color: [0, 0, 0], dialogs: [], speed: 1.0, homeLandmark: "guild" },
      { id: "f", name: "f", color: [0, 0, 0], dialogs: [], speed: 1.0, homeLandmark: "alchemist" },
      { id: "g", name: "g", color: [0, 0, 0], dialogs: [], speed: 1.0, homeLandmark: "docks" },
    ];
    const out = serializeVillagersRon(v);
    expect(out).toContain("home_landmark: Tavern");
    expect(out).toContain("home_landmark: Herbalist");
    expect(out).toContain("home_landmark: Graveyard");
    expect(out).toContain("home_landmark: Jail");
    expect(out).toContain("home_landmark: Guild");
    expect(out).toContain("home_landmark: Alchemist");
    expect(out).toContain("home_landmark: Docks");
    expect(parseVillagersRon(out)).toEqual(v);
  });

  it("기존 RON (home_landmark 없음) 도 무영향 — 미지정은 undefined", () => {
    // 회귀 가드 — bevy-rogue 의 기존 villagers.ron 호환.
    const oldRon = `[VillagerDef(id:"x",name:"x",color:(0,0,0),dialogs:[],speed:1.0)]`;
    const v = parseVillagersRon(oldRon);
    expect("homeLandmark" in v[0]).toBe(false);
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

describe("parse/serialize AccessoriesRon", () => {
  const SRC = `[
    AccessoryDef(
        id: "scout_lens",
        display_name: "올빼미 안경",
        glyph_ascii: "O",
        glyph_unicode: "🔎",
        glyph_game_icon: "🔎",
        pickup_message: "올빼미 안경을 받았다.",
        desc: "잠입 전용. 착용하면 가드 시야가 붉게 표시된다.",
    ),
    AccessoryDef(
        id: "trap_scope",
        display_name: "광부의 등불",
        glyph_ascii: "L",
        glyph_unicode: "🔦",
        glyph_game_icon: "🔦",
        pickup_message: "광부의 등불을 받았다.",
        desc: "함정 전용. 착용하면 시야 안의 함정이 드러난다.",
    ),
]`;

  it("AccessoryDef 두 개를 파싱하고 라운드트립으로 보존한다", () => {
    const accs = parseAccessoriesRon(SRC);
    expect(accs).toHaveLength(2);
    expect(accs[0].id).toBe("scout_lens");
    expect(accs[0].kind).toBe("accessory");
    expect(accs[0].desc).toContain("잠입");
    expect(accs[1].id).toBe("trap_scope");
    expect(accs[1].desc).toContain("함정");
    const reparsed = parseAccessoriesRon(serializeAccessoriesRon(accs));
    expect(reparsed).toEqual(accs);
  });

  it("desc 필드가 빠진 AccessoryDef 도 빈 문자열로 안전하게 파싱된다", () => {
    // desc 가 없어도 parser 가 throw 하지 않고 빈 문자열로 채운다.
    const noDesc = `[AccessoryDef(id:"x",display_name:"x",glyph_ascii:"x",glyph_unicode:"x",glyph_game_icon:"x",pickup_message:"x")]`;
    const accs = parseAccessoriesRon(noDesc);
    expect(accs[0].desc).toBe("");
  });

  it("빈 배열은 [] 로 직렬화된다", () => {
    expect(serializeAccessoriesRon([])).toBe("[]\n");
  });

  it("effects 키 목록을 가진 AccessoryDef 도 라운드트립으로 보존한다", () => {
    const src = `[
      AccessoryDef(
          id: "scout_lens",
          display_name: "올빼미 안경",
          glyph_ascii: "O",
          glyph_unicode: "O",
          glyph_game_icon: "O",
          pickup_message: "획득",
          desc: "잠입 전용.",
          effects: [RevealGuardVision],
      ),
      AccessoryDef(
          id: "trap_scope",
          display_name: "등불",
          glyph_ascii: "L",
          glyph_unicode: "L",
          glyph_game_icon: "L",
          pickup_message: "획득",
          desc: "함정 전용.",
          effects: [RevealTrapsInSight],
      ),
    ]`;
    const accs = parseAccessoriesRon(src);
    expect(accs[0].effects).toEqual(["RevealGuardVision"]);
    expect(accs[1].effects).toEqual(["RevealTrapsInSight"]);
    const reparsed = parseAccessoriesRon(serializeAccessoriesRon(accs));
    expect(reparsed).toEqual(accs);
  });

  it("effects 가 누락된 AccessoryDef 는 effects undefined 로 파싱되고 직렬화에도 누락된다", () => {
    const src = `[AccessoryDef(id:"x",display_name:"x",glyph_ascii:"x",glyph_unicode:"x",glyph_game_icon:"x",pickup_message:"x",desc:"x")]`;
    const accs = parseAccessoriesRon(src);
    expect(accs[0].effects).toBeUndefined();
    // 직렬화 결과에는 effects 줄이 없어야 한다 — 라운드트립 안정.
    const ron = serializeAccessoriesRon(accs);
    expect(ron).not.toContain("effects:");
  });

  it("알 수 없는 effect 키는 throw 한다", () => {
    const bad = `[AccessoryDef(id:"x",display_name:"x",glyph_ascii:"x",glyph_unicode:"x",glyph_game_icon:"x",pickup_message:"x",desc:"x",effects:[NotARealEffect])]`;
    expect(() => parseAccessoriesRon(bad)).toThrow(/Unknown AccessoryEffect/);
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

  it("zones 의 옛 Dungeon(N)/Forest 표기는 Named 로 변환되어 파싱", () => {
    const monsters = parseMonstersRon(SRC);
    expect(monsters[0].zones).toEqual([
      { type: "Named", id: "dungeon_3" },
      { type: "Named", id: "forest" },
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


// ─── StartLoadout ─────────────────────────────────────────────────────────────

import { parseStartLoadoutDef, serializeStartLoadoutRon } from "./ron";
import type { StartLoadoutDef } from "@/types/start-loadout";
import fs from "node:fs";
import path from "node:path";

describe("parseStartLoadoutDef", () => {
  it("None 인 weapon/armor 와 빈 items/consumables 를 파싱한다", () => {
    const src = `StartLoadout(
      gold: 50,
      weapon: None,
      armor: None,
      items: [],
      consumables: [],
    )`;
    const def = parseStartLoadoutDef(src);
    expect(def).toEqual({
      gold: 50,
      weapon: null,
      armor: null,
      items: [],
      consumables: [],
    });
  });

  it("Some(\"x\") weapon/armor 를 문자열로 파싱한다", () => {
    const src = `StartLoadout(
      gold: 100,
      weapon: Some("sword"),
      armor: Some("leather"),
      items: [],
      consumables: [],
    )`;
    const def = parseStartLoadoutDef(src);
    expect(def.weapon).toBe("sword");
    expect(def.armor).toBe("leather");
  });

  it("items 와 consumables 튜플 리스트를 파싱한다", () => {
    const src = `StartLoadout(
      gold: 50,
      weapon: None,
      armor: None,
      items: ["sword", "spear", "bow"],
      consumables: [("health_potion", 10), ("trap_kit", 3), ("disarm_tool", 1)],
    )`;
    const def = parseStartLoadoutDef(src);
    expect(def.items).toEqual(["sword", "spear", "bow"]);
    expect(def.consumables).toEqual([
      { id: "health_potion", count: 10 },
      { id: "trap_kit", count: 3 },
      { id: "disarm_tool", count: 1 },
    ]);
  });

  it("주석이 섞여 있어도 파싱된다", () => {
    const src = `
// 시작 인벤토리
StartLoadout(
    gold: 50,
    weapon: None,
    armor: None,
    items: ["sword"],
    consumables: [("health_potion", 1)],
)`;
    const def = parseStartLoadoutDef(src);
    expect(def.items).toEqual(["sword"]);
  });
});

describe("serializeStartLoadoutRon", () => {
  it("None weapon/armor 와 빈 배열을 명시적으로 출력한다", () => {
    const def: StartLoadoutDef = {
      gold: 50,
      weapon: null,
      armor: null,
      items: [],
      consumables: [],
    };
    const out = serializeStartLoadoutRon(def);
    expect(out).toContain("weapon: None");
    expect(out).toContain("armor: None");
    expect(out).toContain("items: []");
    expect(out).toContain("consumables: []");
  });

  it("Some(...) 와 튜플 리스트를 출력한다", () => {
    const def: StartLoadoutDef = {
      gold: 50,
      weapon: "sword",
      armor: "leather",
      items: ["sword", "spear"],
      consumables: [{ id: "health_potion", count: 10 }],
    };
    const out = serializeStartLoadoutRon(def);
    expect(out).toContain(`weapon: Some("sword")`);
    expect(out).toContain(`armor: Some("leather")`);
    expect(out).toContain(`items: ["sword", "spear"]`);
    expect(out).toContain(`consumables: [("health_potion", 10)]`);
  });

  it("직렬화 후 재파싱하면 동일 구조 반환 (round-trip)", () => {
    const def: StartLoadoutDef = {
      gold: 42,
      weapon: "spear",
      armor: null,
      items: ["sword", "bow", "bow"],
      consumables: [
        { id: "health_potion", count: 10 },
        { id: "trap_kit", count: 3 },
      ],
    };
    expect(parseStartLoadoutDef(serializeStartLoadoutRon(def))).toEqual(def);
  });

  it("게임 측 assets/items/start_loadout.ron 미러 (가능하면)", () => {
    const ronPath = "/home/seungrye/bevy-rogue/assets/items/start_loadout.ron";
    if (!fs.existsSync(ronPath)) return; // 게임 repo 가 없는 환경에서는 스킵
    const src = fs.readFileSync(ronPath, "utf8");
    const parsed = parseStartLoadoutDef(src);
    // 게임 파일이 변동 가능하므로 round-trip 동치성만 검증.
    const round = parseStartLoadoutDef(serializeStartLoadoutRon(parsed));
    expect(round).toEqual(parsed);
    // 회귀 가드: 비어있지 않아야 함
    expect(parsed.gold).toBeGreaterThanOrEqual(0);
    // 게임이 sword/spear/bow + health_potion 을 기대 → spot check
    expect(parsed.items).toContain("sword");
    expect(parsed.consumables.find((c) => c.id === "health_potion")?.count).toBeGreaterThanOrEqual(1);
    // path/fs 변수가 사용됨을 명시
    void path;
  });
});

import { serializeTownConfigRon } from "./ron";
import { TOWN_CONFIG_DEFAULTS } from "@/types/town-config";

describe("serializeTownConfigRon", () => {
  it("기본값 → PascalCase enum + landmarks 배열 + environment Plains", () => {
    const ron = serializeTownConfigRon(TOWN_CONFIG_DEFAULTS);
    expect(ron).toContain("TownOptions(");
    expect(ron).toContain("size: Village,");
    expect(ron).toContain("roads: Radial,");
    expect(ron).toContain("wealth: Common,");
    expect(ron).toContain("defenses: None,");
    expect(ron).toContain("landmarks: [Inn, Smithy],");
    expect(ron).toContain("fields: true,");
    expect(ron).toContain("environment: Plains,");
    expect(ron.endsWith(")\n")).toBe(true);
  });

  it("모든 옵션 값 변환 (13 landmark 포함)", () => {
    const ron = serializeTownConfigRon({
      size: "town", roads: "linear", wealth: "wealthy",
      defenses: "stone",
      landmarks: [
        "inn", "smithy", "temple", "guard", "market", "manor",
        "tavern", "herbalist", "graveyard", "jail", "guild", "alchemist", "docks",
      ],
      fields: false,
      environment: "coastal",
    });
    expect(ron).toContain("size: Town,");
    expect(ron).toContain("roads: Linear,");
    expect(ron).toContain("wealth: Wealthy,");
    expect(ron).toContain("defenses: Stone,");
    expect(ron).toContain(
      "landmarks: [Inn, Smithy, Temple, Guard, Market, Manor, Tavern, Herbalist, Graveyard, Jail, Guild, Alchemist, Docks],",
    );
    expect(ron).toContain("fields: false,");
    expect(ron).toContain("environment: Coastal,");
  });

  it("빈 landmarks 도 직렬화 가능", () => {
    const ron = serializeTownConfigRon({
      size: "hamlet", roads: "random", wealth: "poor",
      defenses: "wooden", landmarks: [], fields: true, environment: "plains",
    });
    expect(ron).toContain("landmarks: [],");
    expect(ron).toContain("defenses: Wooden,");
    expect(ron).toContain("size: Hamlet,");
    expect(ron).toContain("roads: Random,");
    expect(ron).toContain("wealth: Poor,");
    expect(ron).toContain("environment: Plains,");
  });
});

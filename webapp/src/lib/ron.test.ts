import { describe, it, expect } from "vitest";
import { parseRon, serializeRon, parseVillagersRon, serializeVillagersRon } from "./ron";
import { readFileSync } from "fs";
import { join } from "path";
import type { QuestDef } from "@/types/quest";
import type { VillagerDef } from "@/types/villager";

const SIMPLE_RON = `
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
            on_interact: [AdvancePhase("active")],
            auto_advance: [],
            objective: Some("병사와 대화하라."),
        ),

        "active": QuestPhaseDef(
            dialog: [
                "아이템을 찾아오세요.",
            ],
            on_interact: [],
            auto_advance: [
                AutoAdvance(
                    condition: HasItem("key_item"),
                    next_phase: "done",
                ),
            ],
            objective: Some("던전에서 아이템을 가져와라."),
        ),

        "done": QuestPhaseDef(
            dialog: [],
            on_interact: [
                GiveItem("reward"),
                SetFlag(flag: "quest_done", value: "true"),
            ],
            auto_advance: [],
            objective: None,
        ),
    },

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

  it("on_interact AdvancePhase 파싱", () => {
    const quest = parseRon(SIMPLE_RON);
    expect(quest.phases["dormant"].on_interact[0]).toEqual({ type: "AdvancePhase", phaseId: "active" });
  });

  it("auto_advance HasItem 조건 파싱", () => {
    const quest = parseRon(SIMPLE_RON);
    const aa = quest.phases["active"].auto_advance[0];
    expect(aa.condition).toEqual({ type: "HasItem", itemId: "key_item" });
    expect(aa.nextPhase).toBe("done");
  });

  it("GiveItem / SetFlag 액션 파싱", () => {
    const quest = parseRon(SIMPLE_RON);
    const actions = quest.phases["done"].on_interact;
    expect(actions[0]).toEqual({ type: "GiveItem", itemId: "reward" });
    expect(actions[1]).toEqual({ type: "SetFlag", flag: "quest_done", value: "true" });
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
});

describe("parseRon — 복합 조건", () => {
  const COMPLEX_COND_RON = `
QuestDef(
    id: "cond_test",
    title: "조건 테스트",
    giver_npc: "NPC",
    initial_phase: "a",
    phases: {
        "a": QuestPhaseDef(
            dialog: [],
            on_interact: [],
            auto_advance: [
                AutoAdvance(condition: And([HasItem("x"), FlagIs(flag: "f", value: "v")]), next_phase: "b"),
                AutoAdvance(condition: Or([HasItem("y"), PhaseIs(quest: "q2", phase: "done")]), next_phase: "c"),
                AutoAdvance(condition: Not(HasItem("z")), next_phase: "d"),
            ],
            objective: None,
        ),
        "b": QuestPhaseDef(dialog: [], on_interact: [], auto_advance: [], objective: None),
        "c": QuestPhaseDef(dialog: [], on_interact: [], auto_advance: [], objective: None),
        "d": QuestPhaseDef(dialog: [], on_interact: [], auto_advance: [], objective: None),
    },
    spawns: [],
)
`;

  it("And 조건 파싱", () => {
    const quest = parseRon(COMPLEX_COND_RON);
    const cond = quest.phases["a"].auto_advance[0].condition;
    expect(cond).toEqual({
      type: "And",
      conditions: [
        { type: "HasItem", itemId: "x" },
        { type: "FlagIs", flag: "f", value: "v" },
      ],
    });
  });

  it("Or + PhaseIs 조건 파싱", () => {
    const quest = parseRon(COMPLEX_COND_RON);
    const cond = quest.phases["a"].auto_advance[1].condition;
    expect(cond).toEqual({
      type: "Or",
      conditions: [
        { type: "HasItem", itemId: "y" },
        { type: "PhaseIs", quest: "q2", phase: "done" },
      ],
    });
  });

  it("Not 조건 파싱", () => {
    const quest = parseRon(COMPLEX_COND_RON);
    const cond = quest.phases["a"].auto_advance[2].condition;
    expect(cond).toEqual({ type: "Not", condition: { type: "HasItem", itemId: "z" } });
  });
});

describe("parseRon — Branch / 새 액션", () => {
  const BRANCH_RON = `
QuestDef(
    id: "branch_test",
    title: "분기 테스트",
    giver_npc: "NPC",
    initial_phase: "a",
    phases: {
        "a": QuestPhaseDef(
            dialog: [],
            on_interact: [
                Branch(
                    condition: FlagIs(flag: "hero", value: "stark"),
                    if_true: [AdvancePhase("stark_path")],
                    if_false: [
                        RemoveItem("old_item"),
                        AdvancePhase("other_path"),
                    ],
                ),
            ],
            auto_advance: [
                AutoAdvance(
                    condition: HasItem("trigger"),
                    next_phase: "b",
                    actions: [DespawnWorldItem("world_obj")],
                ),
            ],
            objective: None,
        ),
        "stark_path": QuestPhaseDef(dialog: [], on_interact: [], auto_advance: [], objective: None),
        "other_path": QuestPhaseDef(dialog: [], on_interact: [], auto_advance: [], objective: None),
        "b": QuestPhaseDef(dialog: [], on_interact: [], auto_advance: [], objective: None),
    },
    spawns: [],
)
`;

  it("Branch(condition, if_true, if_false) 파싱", () => {
    const quest = parseRon(BRANCH_RON);
    const action = quest.phases["a"].on_interact[0];
    expect(action.type).toBe("Branch");
    if (action.type !== "Branch") return;
    expect(action.condition).toEqual({ type: "FlagIs", flag: "hero", value: "stark" });
    expect(action.ifTrue).toEqual([{ type: "AdvancePhase", phaseId: "stark_path" }]);
    expect(action.ifFalse).toEqual([
      { type: "RemoveItem", itemId: "old_item" },
      { type: "AdvancePhase", phaseId: "other_path" },
    ]);
  });

  it("AutoAdvance actions 필드 파싱", () => {
    const quest = parseRon(BRANCH_RON);
    const aa = quest.phases["a"].auto_advance[0];
    expect(aa.actions).toEqual([{ type: "DespawnWorldItem", itemId: "world_obj" }]);
  });

  it("RemoveItem 액션 파싱", () => {
    const quest = parseRon(BRANCH_RON);
    const branch = quest.phases["a"].on_interact[0];
    if (branch.type !== "Branch") return;
    expect(branch.ifFalse[0]).toEqual({ type: "RemoveItem", itemId: "old_item" });
  });
});

describe("serializeRon", () => {
  it("직렬화 후 재파싱하면 동일 구조 반환", () => {
    const quest = parseRon(SIMPLE_RON);
    const reparsed = parseRon(serializeRon(quest));
    expect(reparsed.id).toBe(quest.id);
    expect(reparsed.title).toBe(quest.title);
    expect(reparsed.phases["dormant"].dialog).toEqual(quest.phases["dormant"].dialog);
    expect(reparsed.phases["active"].auto_advance).toEqual(quest.phases["active"].auto_advance);
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
        dormant: {
          dialog: [],
          on_interact: [],
          auto_advance: [{ condition: { type: "FlagIs", flag: "character", value: "stark" }, nextPhase: "active" }],
          objective: null,
        },
        active: { dialog: [], on_interact: [], auto_advance: [], objective: null },
      },
      spawns: [],
    };
    const reparsed = parseRon(serializeRon(quest));
    expect(reparsed.phases["dormant"].auto_advance[0].condition).toEqual({
      type: "FlagIs", flag: "character", value: "stark",
    });
  });

  it("Branch 직렬화/재파싱", () => {
    const quest: QuestDef = {
      id: "branch_serial",
      title: "분기 직렬화",
      giverNpc: "NPC",
      initialPhase: "a",
      phases: {
        a: {
          dialog: [],
          on_interact: [
            {
              type: "Branch",
              condition: { type: "And", conditions: [{ type: "HasItem", itemId: "x" }, { type: "FlagIs", flag: "f", value: "v" }] },
              ifTrue: [{ type: "AdvancePhase", phaseId: "b" }],
              ifFalse: [{ type: "Log", text: "실패" }],
            },
          ],
          auto_advance: [],
          objective: null,
        },
        b: { dialog: [], on_interact: [], auto_advance: [], objective: null },
      },
      spawns: [],
    };
    const reparsed = parseRon(serializeRon(quest));
    const branch = reparsed.phases["a"].on_interact[0];
    expect(branch.type).toBe("Branch");
    if (branch.type !== "Branch") return;
    expect(branch.condition).toEqual({
      type: "And",
      conditions: [{ type: "HasItem", itemId: "x" }, { type: "FlagIs", flag: "f", value: "v" }],
    });
    expect(branch.ifTrue).toEqual([{ type: "AdvancePhase", phaseId: "b" }]);
  });
});

describe("parseRon — 신규 변형 (B1)", () => {
  it("HasFlag 조건 파싱", () => {
    const src = `QuestDef(id:"t",title:"t",giver_npc:"n",initial_phase:"a",
      phases:{"a":QuestPhaseDef(dialog:[],on_interact:[],
        auto_advance:[AutoAdvance(condition:HasFlag("seen"),next_phase:"b")],
        objective:None)},spawns:[])`;
    const quest = parseRon(src);
    expect(quest.phases["a"].auto_advance[0].condition).toEqual({ type: "HasFlag", flag: "seen" });
  });

  it("GiveItems 액션 파싱", () => {
    const src = `QuestDef(id:"t",title:"t",giver_npc:"n",initial_phase:"a",
      phases:{"a":QuestPhaseDef(dialog:[],
        on_interact:[GiveItems(item:"potion",count:5)],
        auto_advance:[],objective:None)},spawns:[])`;
    const quest = parseRon(src);
    expect(quest.phases["a"].on_interact[0]).toEqual({ type: "GiveItems", itemId: "potion", count: 5 });
  });

  it("ClearFlag 액션 파싱", () => {
    const src = `QuestDef(id:"t",title:"t",giver_npc:"n",initial_phase:"a",
      phases:{"a":QuestPhaseDef(dialog:[],
        on_interact:[ClearFlag("flag1")],
        auto_advance:[],objective:None)},spawns:[])`;
    const quest = parseRon(src);
    expect(quest.phases["a"].on_interact[0]).toEqual({ type: "ClearFlag", flag: "flag1" });
  });

  it("OpenPortal 기본 (placement 생략) 파싱", () => {
    const src = `QuestDef(id:"t",title:"t",giver_npc:"n",initial_phase:"a",
      phases:{"a":QuestPhaseDef(dialog:[],
        on_interact:[OpenPortal(zone:"cave",generator:"bsp")],
        auto_advance:[],objective:None)},spawns:[])`;
    const quest = parseRon(src);
    expect(quest.phases["a"].on_interact[0]).toEqual({
      type: "OpenPortal", zone: "cave", generator: "bsp",
    });
  });

  it("OpenPortal placement: Border 파싱", () => {
    const src = `QuestDef(id:"t",title:"t",giver_npc:"n",initial_phase:"a",
      phases:{"a":QuestPhaseDef(dialog:[],
        on_interact:[OpenPortal(zone:"glade",generator:"forest",placement:Border)],
        auto_advance:[],objective:None)},spawns:[])`;
    const quest = parseRon(src);
    expect(quest.phases["a"].on_interact[0]).toEqual({
      type: "OpenPortal", zone: "glade", generator: "forest",
      placement: { type: "Border" },
    });
  });

  it("OpenPortal placement: NearGiver(radius) 파싱", () => {
    const src = `QuestDef(id:"t",title:"t",giver_npc:"n",initial_phase:"a",
      phases:{"a":QuestPhaseDef(dialog:[],
        on_interact:[OpenPortal(zone:"z",generator:"g",placement:NearGiver(radius:5))],
        auto_advance:[],objective:None)},spawns:[])`;
    const quest = parseRon(src);
    expect(quest.phases["a"].on_interact[0]).toEqual({
      type: "OpenPortal", zone: "z", generator: "g",
      placement: { type: "NearGiver", radius: 5 },
    });
  });

  it("ClosePortal 액션 파싱", () => {
    const src = `QuestDef(id:"t",title:"t",giver_npc:"n",initial_phase:"a",
      phases:{"a":QuestPhaseDef(dialog:[],
        on_interact:[ClosePortal("cave")],
        auto_advance:[],objective:None)},spawns:[])`;
    const quest = parseRon(src);
    expect(quest.phases["a"].on_interact[0]).toEqual({ type: "ClosePortal", zone: "cave" });
  });

  it("InZone(Town) / InZone(Named) 파싱", () => {
    const src = `QuestDef(id:"t",title:"t",giver_npc:"n",initial_phase:"a",
      phases:{"a":QuestPhaseDef(dialog:[],on_interact:[],
        auto_advance:[
          AutoAdvance(condition:InZone(Town),next_phase:"b"),
          AutoAdvance(condition:InZone(Named("herb_glade")),next_phase:"c"),
        ],
        objective:None)},spawns:[])`;
    const quest = parseRon(src);
    expect(quest.phases["a"].auto_advance[0].condition).toEqual({ type: "InZone", zone: { type: "Town" } });
    expect(quest.phases["a"].auto_advance[1].condition).toEqual({
      type: "InZone", zone: { type: "Named", id: "herb_glade" },
    });
  });

  it("QuestSpawn count / condition 파싱", () => {
    const src = `QuestDef(id:"t",title:"t",giver_npc:"n",initial_phase:"a",
      phases:{"a":QuestPhaseDef(dialog:[],on_interact:[],auto_advance:[],objective:None)},
      spawns:[
        QuestSpawn(phase:"a",item:"x",zone:Named("z"),count:3),
        QuestSpawn(phase:"a",item:"y",zone:Forest,condition:Some(HasFlag("f"))),
      ])`;
    const quest = parseRon(src);
    expect(quest.spawns[0]).toEqual({
      phase: "a", item: "x", zone: { type: "Named", id: "z" }, count: 3,
    });
    expect(quest.spawns[1]).toEqual({
      phase: "a", item: "y", zone: { type: "Forest" }, condition: { type: "HasFlag", flag: "f" },
    });
  });

  it("QuestDef.spawn_chance 파싱", () => {
    const src = `QuestDef(id:"t",title:"t",giver_npc:"n",initial_phase:"a",spawn_chance:0.7,
      phases:{"a":QuestPhaseDef(dialog:[],on_interact:[],auto_advance:[],objective:None)},
      spawns:[])`;
    const quest = parseRon(src);
    expect(quest.spawnChance).toBeCloseTo(0.7);
  });
});

describe("serializeRon — 신규 변형 라운드트립", () => {
  it("HasFlag / GiveItems / ClearFlag / OpenPortal / ClosePortal / Named zone / spawn count·condition / spawn_chance", () => {
    const quest: QuestDef = {
      id: "rt", title: "rt", giverNpc: "n", initialPhase: "a",
      spawnChance: 0.5,
      phases: {
        a: {
          dialog: [],
          on_interact: [
            { type: "GiveItems", itemId: "potion", count: 5 },
            { type: "ClearFlag", flag: "f" },
            { type: "OpenPortal", zone: "z", generator: "bsp", placement: { type: "Border" } },
            { type: "OpenPortal", zone: "z2", generator: "forest", placement: { type: "NearGiver", radius: 3 } },
            { type: "OpenPortal", zone: "z3", generator: "bsp" },
            { type: "ClosePortal", zone: "z" },
          ],
          auto_advance: [
            { condition: { type: "HasFlag", flag: "x" }, nextPhase: "b" },
            { condition: { type: "InZone", zone: { type: "Named", id: "glade" } }, nextPhase: "c" },
            { condition: { type: "InZone", zone: { type: "Town" } }, nextPhase: "d" },
          ],
          objective: null,
        },
        b: { dialog: [], on_interact: [], auto_advance: [], objective: null },
        c: { dialog: [], on_interact: [], auto_advance: [], objective: null },
        d: { dialog: [], on_interact: [], auto_advance: [], objective: null },
      },
      spawns: [
        { phase: "a", item: "x", zone: { type: "Named", id: "glade" }, count: 3 },
        { phase: "a", item: "y", zone: { type: "Town" }, condition: { type: "HasFlag", flag: "f" } },
      ],
    };
    const reparsed = parseRon(serializeRon(quest));
    expect(reparsed).toEqual(quest);
  });
});

describe("실제 .ron 파일 파싱·라운드트립", () => {
  const questsDir = join(process.cwd(), "quests");

  const files = [
    "gem_quest.ron",
    "herb_quest.ron",
    "alchemist_quest.ron",
    "parry_quest.ron",
    "demonsword_quest.ron",
    "prologue_fog.ron",
    "stark_quest.ron",
    "targaryen_quest.ron",
    "jon_snow_quest.ron",
    "world_fracture.ron",
  ];

  for (const file of files) {
    it(`${file} 파싱 성공`, () => {
      const src = readFileSync(join(questsDir, file), "utf8");
      expect(() => parseRon(src)).not.toThrow();
      const quest = parseRon(src);
      expect(quest.id).toBeTruthy();
      expect(Object.keys(quest.phases).length).toBeGreaterThan(0);
    });

    it(`${file} 라운드트립 (parse → serialize → parse 동일)`, () => {
      const src = readFileSync(join(questsDir, file), "utf8");
      const first = parseRon(src);
      const second = parseRon(serializeRon(first));
      expect(second).toEqual(first);
    });
  }
});

describe("parseVillagersRon — 기본", () => {
  const SIMPLE = `[
    VillagerDef(
        name: "장로",
        color: (0.9, 0.8, 0.5),
        dialogs: [],
        quest_id: Some("gem_quest"),
        speed: 0.5,
    ),
    VillagerDef(
        name: "촌장",
        color: (1.0, 0.85, 0.0),
        dialogs: [
            "안녕",
            "잘 가게.",
        ],
        quest_id: None,
        speed: 1.0,
    ),
]`;

  it("VillagerDef 2개 파싱", () => {
    const villagers = parseVillagersRon(SIMPLE);
    expect(villagers).toHaveLength(2);
    expect(villagers[0]).toEqual({
      name: "장로",
      color: [0.9, 0.8, 0.5],
      dialogs: [],
      questId: "gem_quest",
      speed: 0.5,
    });
    expect(villagers[1]).toEqual({
      name: "촌장",
      color: [1.0, 0.85, 0.0],
      dialogs: ["안녕", "잘 가게."],
      questId: null,
      speed: 1.0,
    });
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

  it("questId null 은 None, 값 있으면 Some", () => {
    const villagers: VillagerDef[] = [
      { name: "a", color: [0, 0, 0], dialogs: [], questId: null, speed: 1.0 },
      { name: "b", color: [1, 1, 1], dialogs: [], questId: "q1", speed: 1.0 },
    ];
    const out = serializeVillagersRon(villagers);
    expect(out).toContain("quest_id: None");
    expect(out).toContain('quest_id: Some("q1")');
  });
});

describe("실제 villagers.ron 파싱·라운드트립", () => {
  it("bevy-rogue villagers.ron round-trip", () => {
    const src = readFileSync(join(process.cwd(), "villagers", "villagers.ron"), "utf8");
    const first = parseVillagersRon(src);
    expect(first.length).toBeGreaterThan(0);
    const second = parseVillagersRon(serializeVillagersRon(first));
    expect(second).toEqual(first);
  });

  it("bevy-rogue 의 첫 villager 가 장로 + gem_quest 연결", () => {
    const src = readFileSync(join(process.cwd(), "villagers", "villagers.ron"), "utf8");
    const villagers = parseVillagersRon(src);
    const elder = villagers.find((v) => v.name === "장로");
    expect(elder).toBeDefined();
    expect(elder?.questId).toBe("gem_quest");
  });
});

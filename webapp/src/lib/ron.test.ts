import { describe, it, expect } from "vitest";
import { parseRon, serializeRon } from "./ron";
import type { QuestDef } from "@/types/quest";

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

describe("parseRon", () => {
  it("기본 QuestDef 파싱", () => {
    const quest = parseRon(SIMPLE_RON);
    expect(quest.id).toBe("test_quest");
    expect(quest.title).toBe("테스트 퀘스트");
    expect(quest.giverNpc).toBe("병사");
    expect(quest.initialPhase).toBe("dormant");
  });

  it("페이즈 파싱", () => {
    const quest = parseRon(SIMPLE_RON);
    expect(Object.keys(quest.phases)).toEqual(["dormant", "active", "done"]);
  });

  it("dialog 파싱", () => {
    const quest = parseRon(SIMPLE_RON);
    expect(quest.phases["dormant"].dialog).toEqual(["안녕하세요.", "시작해볼까요?"]);
  });

  it("on_interact AdvancePhase 파싱", () => {
    const quest = parseRon(SIMPLE_RON);
    const action = quest.phases["dormant"].on_interact[0];
    expect(action).toEqual({ type: "AdvancePhase", phaseId: "active" });
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
    expect(quest.spawns[0]).toEqual({
      phase: "active",
      item: "key_item",
      zone: { type: "Dungeon", level: 1 },
    });
  });
});

describe("serializeRon", () => {
  it("직렬화 후 재파싱하면 동일 구조 반환", () => {
    const quest = parseRon(SIMPLE_RON);
    const ron = serializeRon(quest);
    const reparsed = parseRon(ron);
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
          auto_advance: [
            {
              condition: { type: "FlagIs", flag: "character", value: "stark" },
              nextPhase: "active",
            },
          ],
          objective: null,
        },
        active: { dialog: [], on_interact: [], auto_advance: [], objective: null },
      },
      spawns: [],
    };
    const ron = serializeRon(quest);
    const reparsed = parseRon(ron);
    expect(reparsed.phases["dormant"].auto_advance[0].condition).toEqual({
      type: "FlagIs",
      flag: "character",
      value: "stark",
    });
  });
});

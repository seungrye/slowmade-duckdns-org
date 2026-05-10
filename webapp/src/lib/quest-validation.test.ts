import { describe, it, expect } from "vitest";
import { validateQuestRefs, type CatalogSets } from "./quest-validation";
import type { QuestDef } from "@/types/quest";

const empty: CatalogSets = {
  villagers: new Set(),
  items: new Set(),
  zones: new Set(),
};

const full: CatalogSets = {
  villagers: new Set(["장로", "엘렌"]),
  items: new Set(["sword", "eternal_gem", "health_potion"]),
  zones: new Set(["demon_cave", "herb_glade"]),
};

function quest(partial: Partial<QuestDef> = {}): QuestDef {
  return {
    id: "q",
    title: "퀘스트",
    giverNpc: "",
    initialPhase: "dormant",
    phases: { dormant: { dialog: [], on_interact: [], auto_advance: [], objective: null } },
    spawns: [],
    ...partial,
  };
}

describe("validateQuestRefs — giverNpc", () => {
  it("등록된 villager 면 통과", () => {
    expect(validateQuestRefs(quest({ giverNpc: "장로" }), full)).toEqual([]);
  });

  it("미등록 villager 면 경고", () => {
    expect(validateQuestRefs(quest({ giverNpc: "없는NPC" }), full)).toEqual([
      { path: "giverNpc", kind: "villager", missing: "없는NPC" },
    ]);
  });

  it("빈 giverNpc 는 검증 스킵 (작성 중간 상태 허용)", () => {
    expect(validateQuestRefs(quest({ giverNpc: "" }), empty)).toEqual([]);
  });
});

describe("validateQuestRefs — Action 참조", () => {
  it("GiveItem 의 미등록 itemId", () => {
    const q = quest({
      phases: {
        dormant: {
          dialog: [], auto_advance: [], objective: null,
          on_interact: [{ type: "GiveItem", itemId: "없는item" }],
        },
      },
    });
    const w = validateQuestRefs(q, full);
    expect(w).toEqual([
      { path: "phases.dormant.on_interact[0].itemId", kind: "item", missing: "없는item" },
    ]);
  });

  it("KillNpc 의 미등록 npcId", () => {
    const q = quest({
      phases: {
        dormant: {
          dialog: [], auto_advance: [], objective: null,
          on_interact: [{ type: "KillNpc", npcId: "없는NPC" }],
        },
      },
    });
    expect(validateQuestRefs(q, full)).toEqual([
      { path: "phases.dormant.on_interact[0].npcId", kind: "villager", missing: "없는NPC" },
    ]);
  });

  it("OpenPortal 미등록 zone", () => {
    const q = quest({
      phases: {
        dormant: {
          dialog: [], auto_advance: [], objective: null,
          on_interact: [{ type: "OpenPortal", zone: "없는존", generator: "bsp" }],
        },
      },
    });
    expect(validateQuestRefs(q, full)).toEqual([
      { path: "phases.dormant.on_interact[0].zone", kind: "zone", missing: "없는존" },
    ]);
  });

  it("ClosePortal 미등록 zone", () => {
    const q = quest({
      phases: {
        dormant: {
          dialog: [], auto_advance: [], objective: null,
          on_interact: [{ type: "ClosePortal", zone: "없는존" }],
        },
      },
    });
    expect(validateQuestRefs(q, full)).toEqual([
      { path: "phases.dormant.on_interact[0].zone", kind: "zone", missing: "없는존" },
    ]);
  });

  it("GiveItems / RemoveItem / DespawnWorldItem 모두 itemId 검증", () => {
    const q = quest({
      phases: {
        dormant: {
          dialog: [], auto_advance: [], objective: null,
          on_interact: [
            { type: "GiveItems", itemId: "sword", count: 1 },
            { type: "RemoveItem", itemId: "없는1" },
            { type: "DespawnWorldItem", itemId: "없는2" },
          ],
        },
      },
    });
    const w = validateQuestRefs(q, full);
    expect(w.map((x) => x.missing)).toEqual(["없는1", "없는2"]);
  });

  it("Branch 의 ifTrue/ifFalse 재귀 검사", () => {
    const q = quest({
      phases: {
        dormant: {
          dialog: [], auto_advance: [], objective: null,
          on_interact: [
            {
              type: "Branch",
              condition: { type: "HasItem", itemId: "없는조건" },
              ifTrue: [{ type: "GiveItem", itemId: "없는true" }],
              ifFalse: [{ type: "GiveItem", itemId: "없는false" }],
            },
          ],
        },
      },
    });
    const w = validateQuestRefs(q, full);
    const paths = w.map((x) => x.path);
    expect(paths).toContain("phases.dormant.on_interact[0].condition.itemId");
    expect(paths).toContain("phases.dormant.on_interact[0].if_true[0].itemId");
    expect(paths).toContain("phases.dormant.on_interact[0].if_false[0].itemId");
  });

  it("auto_advance 의 condition + actions 모두 검사", () => {
    const q = quest({
      phases: {
        dormant: {
          dialog: [], on_interact: [], objective: null,
          auto_advance: [{
            condition: { type: "HasItem", itemId: "없는cond" },
            nextPhase: "next",
            actions: [{ type: "DespawnWorldItem", itemId: "없는act" }],
          }],
        },
      },
    });
    const w = validateQuestRefs(q, full);
    const paths = w.map((x) => x.path);
    expect(paths).toContain("phases.dormant.auto_advance[0].condition.itemId");
    expect(paths).toContain("phases.dormant.auto_advance[0].actions[0].itemId");
  });

  it("AdvancePhase, Log, SetFlag, ClearFlag 는 검증 대상 없음", () => {
    const q = quest({
      phases: {
        dormant: {
          dialog: [], auto_advance: [], objective: null,
          on_interact: [
            { type: "AdvancePhase", phaseId: "x" },
            { type: "Log", text: "hi" },
            { type: "SetFlag", flag: "f", value: "v" },
            { type: "ClearFlag", flag: "f" },
          ],
        },
      },
    });
    expect(validateQuestRefs(q, empty)).toEqual([]);
  });
});

describe("validateQuestRefs — Condition 참조", () => {
  it("HasItem 미등록", () => {
    const q = quest({
      phases: {
        dormant: {
          dialog: [], on_interact: [], objective: null,
          auto_advance: [{ condition: { type: "HasItem", itemId: "없는" }, nextPhase: "x" }],
        },
      },
    });
    const w = validateQuestRefs(q, full);
    expect(w[0]).toEqual({
      path: "phases.dormant.auto_advance[0].condition.itemId",
      kind: "item",
      missing: "없는",
    });
  });

  it("InZone(Named) 미등록", () => {
    const q = quest({
      phases: {
        dormant: {
          dialog: [], on_interact: [], objective: null,
          auto_advance: [{
            condition: { type: "InZone", zone: { type: "Named", id: "없는존" } },
            nextPhase: "x",
          }],
        },
      },
    });
    expect(validateQuestRefs(q, full)[0].path).toBe(
      "phases.dormant.auto_advance[0].condition.zone.id",
    );
  });

  it("InZone(Town/Forest/Dungeon) 은 검증 안 함", () => {
    const q = quest({
      phases: {
        dormant: {
          dialog: [], on_interact: [], objective: null,
          auto_advance: [
            { condition: { type: "InZone", zone: { type: "Town" } }, nextPhase: "x" },
            { condition: { type: "InZone", zone: { type: "Forest" } }, nextPhase: "y" },
            { condition: { type: "InZone", zone: { type: "Dungeon", level: 1 } }, nextPhase: "z" },
          ],
        },
      },
    });
    expect(validateQuestRefs(q, empty)).toEqual([]);
  });

  it("And/Or/Not 재귀", () => {
    const q = quest({
      phases: {
        dormant: {
          dialog: [], on_interact: [], objective: null,
          auto_advance: [{
            condition: {
              type: "And",
              conditions: [
                { type: "HasItem", itemId: "없는1" },
                {
                  type: "Or",
                  conditions: [
                    { type: "Not", condition: { type: "HasItem", itemId: "없는2" } },
                    { type: "HasItem", itemId: "sword" },
                  ],
                },
              ],
            },
            nextPhase: "x",
          }],
        },
      },
    });
    const w = validateQuestRefs(q, full);
    expect(w.map((x) => x.missing).sort()).toEqual(["없는1", "없는2"]);
  });

  it("FlagIs, HasFlag, Always 는 검증 안 함", () => {
    const q = quest({
      phases: {
        dormant: {
          dialog: [], on_interact: [], objective: null,
          auto_advance: [
            { condition: { type: "Always" }, nextPhase: "a" },
            { condition: { type: "FlagIs", flag: "f", value: "v" }, nextPhase: "b" },
            { condition: { type: "HasFlag", flag: "f" }, nextPhase: "c" },
          ],
        },
      },
    });
    expect(validateQuestRefs(q, empty)).toEqual([]);
  });
});

describe("validateQuestRefs — Spawns", () => {
  it("spawn.item 미등록", () => {
    const q = quest({
      spawns: [{ phase: "p", item: "없는", zone: { type: "Forest" } }],
    });
    expect(validateQuestRefs(q, full)).toEqual([
      { path: "spawns[0].item", kind: "item", missing: "없는" },
    ]);
  });

  it("spawn.zone Named 미등록", () => {
    const q = quest({
      spawns: [{ phase: "p", item: "sword", zone: { type: "Named", id: "없는존" } }],
    });
    expect(validateQuestRefs(q, full)).toEqual([
      { path: "spawns[0].zone.id", kind: "zone", missing: "없는존" },
    ]);
  });

  it("spawn.condition 재귀", () => {
    const q = quest({
      spawns: [{
        phase: "p", item: "sword", zone: { type: "Forest" },
        condition: { type: "HasItem", itemId: "없는" },
      }],
    });
    expect(validateQuestRefs(q, full)).toEqual([
      { path: "spawns[0].condition.itemId", kind: "item", missing: "없는" },
    ]);
  });
});

describe("validateQuestRefs — 정상 퀘스트 (모든 참조 등록)", () => {
  it("warnings 비어있음", () => {
    const q = quest({
      giverNpc: "장로",
      phases: {
        dormant: {
          dialog: [],
          on_interact: [
            { type: "GiveItem", itemId: "sword" },
            { type: "OpenPortal", zone: "demon_cave", generator: "cellular_automata" },
            {
              type: "Branch",
              condition: { type: "HasItem", itemId: "eternal_gem" },
              ifTrue: [{ type: "ClosePortal", zone: "herb_glade" }],
              ifFalse: [],
            },
          ],
          auto_advance: [{
            condition: { type: "InZone", zone: { type: "Named", id: "demon_cave" } },
            nextPhase: "next",
          }],
          objective: null,
        },
      },
      spawns: [
        { phase: "dormant", item: "health_potion", zone: { type: "Named", id: "herb_glade" } },
      ],
    });
    expect(validateQuestRefs(q, full)).toEqual([]);
  });
});

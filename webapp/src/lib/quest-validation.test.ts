import { describe, it, expect } from "vitest";
import { validateQuestRefs, validateQuestStructure, type CatalogSets } from "./quest-validation";
import type { QuestDef, QuestTransition } from "@/types/quest";

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
    phases: { dormant: { dialog: [], objective: null } },
    transitions: [],
    spawns: [],
    ...partial,
  };
}

/** dormant 에서 시작하는 단일 transition 을 가진 quest 헬퍼 */
function questWithTransition(t: Partial<QuestTransition>): QuestDef {
  return quest({
    phases: {
      dormant: { dialog: [], objective: null },
      next: { dialog: [], objective: null },
    },
    transitions: [{ from: "dormant", trigger: "Interact", actions: [], to: "next", ...t }],
  });
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

describe("validateQuestRefs — transition actions 참조", () => {
  it("GiveItem 의 미등록 itemId", () => {
    const q = questWithTransition({ actions: [{ type: "GiveItem", itemId: "없는item" }] });
    expect(validateQuestRefs(q, full)).toEqual([
      { path: "transitions[0].actions[0].itemId", kind: "item", missing: "없는item" },
    ]);
  });

  it("KillNpc 의 미등록 npcId", () => {
    const q = questWithTransition({ actions: [{ type: "KillNpc", npcId: "없는NPC" }] });
    expect(validateQuestRefs(q, full)).toEqual([
      { path: "transitions[0].actions[0].npcId", kind: "villager", missing: "없는NPC" },
    ]);
  });

  it("OpenPortal 미등록 zone", () => {
    const q = questWithTransition({ actions: [{ type: "OpenPortal", zone: "없는존", generator: "bsp" }] });
    expect(validateQuestRefs(q, full)).toEqual([
      { path: "transitions[0].actions[0].zone", kind: "zone", missing: "없는존" },
    ]);
  });

  it("ClosePortal 미등록 zone", () => {
    const q = questWithTransition({ actions: [{ type: "ClosePortal", zone: "없는존" }] });
    expect(validateQuestRefs(q, full)).toEqual([
      { path: "transitions[0].actions[0].zone", kind: "zone", missing: "없는존" },
    ]);
  });

  it("GiveItems / RemoveItem / DespawnWorldItem 모두 itemId 검증", () => {
    const q = questWithTransition({
      actions: [
        { type: "GiveItems", itemId: "sword", count: 1 },
        { type: "RemoveItem", itemId: "없는1" },
        { type: "DespawnWorldItem", itemId: "없는2" },
      ],
    });
    const w = validateQuestRefs(q, full);
    expect(w.map((x) => x.missing)).toEqual(["없는1", "없는2"]);
  });

  it("transition 의 when 조건 + actions 모두 검사", () => {
    const q = questWithTransition({
      trigger: "Auto",
      when: { type: "HasItem", itemId: "없는cond" },
      actions: [{ type: "DespawnWorldItem", itemId: "없는act" }],
    });
    const w = validateQuestRefs(q, full);
    const paths = w.map((x) => x.path);
    expect(paths).toContain("transitions[0].when.itemId");
    expect(paths).toContain("transitions[0].actions[0].itemId");
  });

  it("Log, SetFlag, ClearFlag 는 검증 대상 없음", () => {
    const q = questWithTransition({
      actions: [
        { type: "Log", text: "hi" },
        { type: "SetFlag", flag: "f", value: "v" },
        { type: "ClearFlag", flag: "f" },
      ],
    });
    expect(validateQuestRefs(q, empty)).toEqual([]);
  });
});

describe("validateQuestRefs — transition when 조건 참조", () => {
  it("HasItem 미등록", () => {
    const q = questWithTransition({ trigger: "Auto", when: { type: "HasItem", itemId: "없는" } });
    const w = validateQuestRefs(q, full);
    expect(w[0]).toEqual({ path: "transitions[0].when.itemId", kind: "item", missing: "없는" });
  });

  it("InZone(Named) 미등록", () => {
    const q = questWithTransition({
      trigger: "Auto",
      when: { type: "InZone", zone: { type: "Named", id: "없는존" } },
    });
    expect(validateQuestRefs(q, full)[0].path).toBe("transitions[0].when.zone.id");
  });

  it("InZone(Town/Forest/Dungeon) 은 검증 안 함", () => {
    const q = quest({
      phases: { dormant: { dialog: [], objective: null }, x: { dialog: [], objective: null } },
      transitions: [
        { from: "dormant", trigger: "Auto", when: { type: "InZone", zone: { type: "Town" } }, actions: [], to: "x" },
        { from: "dormant", trigger: "Auto", when: { type: "InZone", zone: { type: "Forest" } }, actions: [], to: "x" },
        { from: "dormant", trigger: "Auto", when: { type: "InZone", zone: { type: "Dungeon", level: 1 } }, actions: [], to: "x" },
      ],
    });
    expect(validateQuestRefs(q, empty)).toEqual([]);
  });

  it("And/Or/Not 재귀", () => {
    const q = questWithTransition({
      trigger: "Auto",
      when: {
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
    });
    const w = validateQuestRefs(q, full);
    expect(w.map((x) => x.missing).sort()).toEqual(["없는1", "없는2"]);
  });

  it("FlagIs, HasFlag, Always 는 검증 안 함", () => {
    const q = quest({
      phases: { dormant: { dialog: [], objective: null }, x: { dialog: [], objective: null } },
      transitions: [
        { from: "dormant", trigger: "Auto", when: { type: "Always" }, actions: [], to: "x" },
        { from: "dormant", trigger: "Auto", when: { type: "FlagIs", flag: "f", value: "v" }, actions: [], to: "x" },
        { from: "dormant", trigger: "Auto", when: { type: "HasFlag", flag: "f" }, actions: [], to: "x" },
      ],
    });
    expect(validateQuestRefs(q, empty)).toEqual([]);
  });
});

describe("validateQuestRefs — Spawns", () => {
  it("spawn.item 미등록", () => {
    const q = quest({ spawns: [{ phase: "p", item: "없는", zone: { type: "Forest" } }] });
    expect(validateQuestRefs(q, full)).toEqual([
      { path: "spawns[0].item", kind: "item", missing: "없는" },
    ]);
  });

  it("spawn.zone Named 미등록", () => {
    const q = quest({ spawns: [{ phase: "p", item: "sword", zone: { type: "Named", id: "없는존" } }] });
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
        dormant: { dialog: [], objective: null },
        next: { dialog: [], objective: null },
      },
      transitions: [
        {
          from: "dormant", trigger: "Interact",
          actions: [
            { type: "GiveItem", itemId: "sword" },
            { type: "OpenPortal", zone: "demon_cave", generator: "cellular_automata" },
            { type: "ClosePortal", zone: "herb_glade" },
          ],
          to: "next",
        },
        {
          from: "dormant", trigger: "Auto",
          when: { type: "InZone", zone: { type: "Named", id: "demon_cave" } },
          actions: [], to: "next",
        },
      ],
      spawns: [
        { phase: "dormant", item: "health_potion", zone: { type: "Named", id: "herb_glade" } },
      ],
    });
    expect(validateQuestRefs(q, full)).toEqual([]);
  });
});

// ── validateQuestStructure ────────────────────────────────────────────────────

function makeQuest(overrides: Partial<QuestDef> = {}): QuestDef {
  return {
    id: "q", title: "q", giverNpc: "", initialPhase: "a",
    phases: {
      a: { dialog: [], objective: null },
      b: { dialog: [], objective: null },
    },
    transitions: [],
    spawns: [],
    ...overrides,
  };
}

describe("validateQuestStructure — initialPhase 검증", () => {
  it("initialPhase 가 phases 에 없으면 오류", () => {
    const errors = validateQuestStructure(makeQuest({ initialPhase: "missing" }));
    expect(errors.some(e => e.path === "initialPhase")).toBe(true);
  });

  it("initialPhase 가 phases 에 있으면 통과", () => {
    const errors = validateQuestStructure(makeQuest({ initialPhase: "a" }));
    expect(errors).toEqual([]);
  });
});

describe("validateQuestStructure — transition from/to 검증", () => {
  it("transition to 가 없는 phase 면 오류", () => {
    const q = makeQuest({ transitions: [{ from: "a", trigger: "Interact", actions: [], to: "nonexistent" }] });
    const errors = validateQuestStructure(q);
    expect(errors.some(e => e.message.includes("nonexistent"))).toBe(true);
  });

  it("transition from 이 없는 phase 면 오류", () => {
    const q = makeQuest({ transitions: [{ from: "ghost", trigger: "Interact", actions: [], to: "b" }] });
    const errors = validateQuestStructure(q);
    expect(errors.some(e => e.message.includes("ghost"))).toBe(true);
  });

  it("존재하는 phase 사이 transition 은 통과", () => {
    const q = makeQuest({ transitions: [{ from: "a", trigger: "Interact", actions: [], to: "b" }] });
    expect(validateQuestStructure(q)).toEqual([]);
  });
});

describe("validateQuestStructure — Auto transition actions 타입 제한", () => {
  it("허용되지 않는 액션(GiveItem)이 Auto 에 있으면 오류", () => {
    const q = makeQuest({
      transitions: [{
        from: "a", trigger: "Auto", when: { type: "HasFlag", flag: "x" },
        actions: [{ type: "GiveItem", itemId: "sword" }], to: "b",
      }],
    });
    const errors = validateQuestStructure(q);
    expect(errors.some(e => e.message.includes("GiveItem"))).toBe(true);
  });

  it("허용된 액션(DespawnWorldItem/RemoveItem/SetFlag)은 Auto 에서 통과", () => {
    const q = makeQuest({
      transitions: [{
        from: "a", trigger: "Auto", when: { type: "HasFlag", flag: "x" },
        actions: [
          { type: "DespawnWorldItem", itemId: "i" },
          { type: "RemoveItem", itemId: "i" },
          { type: "SetFlag", flag: "f", value: "v" },
        ],
        to: "b",
      }],
    });
    expect(validateQuestStructure(q)).toEqual([]);
  });

  it("Interact transition 은 모든 액션 허용", () => {
    const q = makeQuest({
      transitions: [{
        from: "a", trigger: "Interact",
        actions: [{ type: "GiveItem", itemId: "sword" }, { type: "OpenPortal", zone: "z", generator: "bsp" }],
        to: "b",
      }],
    });
    expect(validateQuestStructure(q)).toEqual([]);
  });
});

describe("validateQuestStructure — spawnChance 범위 검증", () => {
  it("0.0~1.0 범위는 통과", () => {
    expect(validateQuestStructure(makeQuest({ spawnChance: 0.0 }))).toEqual([]);
    expect(validateQuestStructure(makeQuest({ spawnChance: 0.5 }))).toEqual([]);
    expect(validateQuestStructure(makeQuest({ spawnChance: 1.0 }))).toEqual([]);
  });

  it("범위를 벗어나면 오류", () => {
    const overOne = validateQuestStructure(makeQuest({ spawnChance: 1.5 }));
    expect(overOne.some((e) => e.path === "spawnChance")).toBe(true);
    const negative = validateQuestStructure(makeQuest({ spawnChance: -0.1 }));
    expect(negative.some((e) => e.path === "spawnChance")).toBe(true);
  });

  it("미지정(undefined)은 검증 스킵", () => {
    expect(validateQuestStructure(makeQuest({}))).toEqual([]);
  });
});

describe("validateQuestStructure — spawns phase 검증", () => {
  it("spawn phase 가 없으면 오류", () => {
    const q = makeQuest({ spawns: [{ phase: "phantom", item: "gem", zone: { type: "Town" } }] });
    const errors = validateQuestStructure(q);
    expect(errors.some(e => e.message.includes("phantom"))).toBe(true);
  });

  it("spawn phase 가 존재하면 통과", () => {
    const q = makeQuest({ spawns: [{ phase: "a", item: "gem", zone: { type: "Town" } }] });
    expect(validateQuestStructure(q)).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { conditionSummary, zoneLabel, transitionLabel } from "./condition-summary";

describe("zoneLabel", () => {
  it("각 존 타입을 한글로", () => {
    expect(zoneLabel({ type: "Town" })).toBe("마을");
    expect(zoneLabel({ type: "Named", id: "forest" })).toBe("숲");
    expect(zoneLabel({ type: "Named", id: "dungeon_2" })).toBe("던전 2층");
    expect(zoneLabel({ type: "Named", id: "mountain_village" })).toBe("산속 마을");
    expect(zoneLabel({ type: "Named", id: "seaside_harbor" })).toBe("항구 마을");
    expect(zoneLabel({ type: "Named", id: "demon_cave" })).toBe("demon_cave");
  });
});

describe("conditionSummary", () => {
  it("undefined / Always / And([]) 는 무조건", () => {
    expect(conditionSummary(undefined)).toBe("무조건");
    expect(conditionSummary({ type: "Always" })).toBe("무조건");
    expect(conditionSummary({ type: "And", conditions: [] })).toBe("무조건");
  });

  it("단순 조건", () => {
    expect(conditionSummary({ type: "HasItem", itemId: "eternal_gem" })).toBe("eternal_gem 보유");
    expect(conditionSummary({ type: "HasFlag", flag: "ready" })).toBe("플래그 ready");
    expect(conditionSummary({ type: "FlagIs", flag: "character", value: "stark" })).toBe("character=stark");
    expect(conditionSummary({ type: "PhaseIs", quest: "gem_quest", phase: "done" })).toBe("gem_quest=done");
    expect(conditionSummary({ type: "InZone", zone: { type: "Named", id: "herb_glade" } })).toBe("herb_glade 위치");
  });

  it("Not", () => {
    expect(conditionSummary({ type: "Not", condition: { type: "HasItem", itemId: "x" } })).toBe("!(x 보유)");
  });

  it("And / Or 결합", () => {
    expect(conditionSummary({
      type: "And",
      conditions: [{ type: "HasItem", itemId: "a" }, { type: "HasItem", itemId: "b" }],
    })).toBe("a 보유 & b 보유");
    expect(conditionSummary({
      type: "Or",
      conditions: [{ type: "HasFlag", flag: "f" }, { type: "HasItem", itemId: "b" }],
    })).toBe("플래그 f | b 보유");
  });
});

describe("transitionLabel", () => {
  it("트리거 + 조건 요약", () => {
    expect(transitionLabel("Interact", undefined)).toBe("대화: 무조건");
    expect(transitionLabel("Auto", { type: "HasItem", itemId: "eternal_gem" })).toBe("자동: eternal_gem 보유");
  });

  it("긴 조건은 말줄임", () => {
    const label = transitionLabel("Auto", {
      type: "And",
      conditions: [
        { type: "HasItem", itemId: "dragon_scale" },
        { type: "HasItem", itemId: "ancient_scroll" },
      ],
    });
    expect(label.length).toBeLessThanOrEqual("자동: ".length + 22);
    expect(label.endsWith("…")).toBe(true);
  });
});

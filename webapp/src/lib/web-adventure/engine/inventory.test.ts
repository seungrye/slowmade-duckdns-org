// inventory — groupInventory 단위 (#300).

import { describe, it, expect } from "vitest";
import { groupInventory } from "./inventory";

describe("groupInventory", () => {
  it("빈 배열 → 빈 배열", () => {
    expect(groupInventory([])).toEqual([]);
  });

  it("같은 id 누적 → count 증가", () => {
    const g = groupInventory(["medical_bandage", "medical_bandage", "medical_bandage"]);
    expect(g).toHaveLength(1);
    expect(g[0].id).toBe("medical_bandage");
    expect(g[0].count).toBe(3);
  });

  it("다른 id 진입 순서 보존", () => {
    const g = groupInventory(["ether_refined_water", "mana_stone_fragment", "ether_refined_water"]);
    expect(g.map((e) => e.id)).toEqual(["ether_refined_water", "mana_stone_fragment"]);
    expect(g[0].count).toBe(2);
    expect(g[1].count).toBe(1);
  });

  it("displayName 매핑 (정의된 id)", () => {
    const g = groupInventory(["patient_gown"]);
    expect(g[0].displayName).toBe("환자복");
  });

  it("미정의 id → id 자체를 displayName fallback", () => {
    const g = groupInventory(["xxx_unknown_item"]);
    expect(g[0].displayName).toBe("xxx_unknown_item");
    expect(g[0].count).toBe(1);
  });

  it("정의 + 미정의 혼합 — 둘 다 정상 표시", () => {
    const g = groupInventory(["patient_gown", "xxx_unknown", "patient_gown"]);
    expect(g).toHaveLength(2);
    expect(g[0]).toEqual({ id: "patient_gown", displayName: "환자복", count: 2 });
    expect(g[1].displayName).toBe("xxx_unknown");
  });
});

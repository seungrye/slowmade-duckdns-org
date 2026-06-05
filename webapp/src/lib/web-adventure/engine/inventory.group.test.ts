// #220 — 인벤토리 표시 같은 아이템 갯수 묶기.
//
// groupInventory / formatGroupedItem 헬퍼 단위 테스트.

import { describe, test, expect } from "vitest";
import { groupInventory, formatGroupedItem } from "./inventory";

describe("groupInventory", () => {
  test("같은 아이템 여러 개면 count 누적", () => {
    const result = groupInventory(["bread", "bread", "herb"]);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.id === "bread")).toEqual({
      id: "bread",
      displayName: "빵",
      count: 2,
    });
    expect(result.find((r) => r.id === "herb")).toEqual({
      id: "herb",
      displayName: "약초",
      count: 1,
    });
  });

  test("빈 인벤은 빈 배열", () => {
    expect(groupInventory([])).toEqual([]);
  });

  test("아이템 정의 미존재 id 는 fallback (id 그대로)", () => {
    const result = groupInventory(["mystery_item"]);
    expect(result[0]).toEqual({
      id: "mystery_item",
      displayName: "mystery_item",
      count: 1,
    });
  });

  test("진입 순서 보존", () => {
    const result = groupInventory([
      "torch",
      "bread",
      "bread",
      "spirit_glasses",
    ]);
    expect(result.map((r) => r.id)).toEqual([
      "torch",
      "bread",
      "spirit_glasses",
    ]);
  });
});

describe("formatGroupedItem", () => {
  test("count===1 이면 이름만", () => {
    expect(
      formatGroupedItem({ displayName: "횃불", count: 1, id: "torch" }),
    ).toBe("횃불");
  });

  test("count>1 이면 이름 × N", () => {
    expect(
      formatGroupedItem({ displayName: "빵", count: 2, id: "bread" }),
    ).toBe("빵 × 2");
  });
});

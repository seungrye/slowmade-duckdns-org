// 4 주차 RED — 6 엔딩 메타 검증.
// fail / shopkeeper / wizard_apprentice 가 추가되어야 한다.

import { describe, test, expect } from "vitest";
import { endingsMeta, getEndingMeta, type EndingMeta } from "./endings";

describe("endingsMeta", () => {
  test("6 엔딩 모두 정의 (fail / goblin_friend / main / shopkeeper / spirit / wizard_apprentice)", () => {
    expect(Object.keys(endingsMeta).sort()).toEqual([
      "fail",
      "goblin_friend",
      "main",
      "shopkeeper",
      "spirit",
      "wizard_apprentice",
    ]);
  });

  test("각 엔딩이 title + epilogue + icon 을 가진다", () => {
    for (const [, meta] of Object.entries(endingsMeta)) {
      const m = meta as EndingMeta;
      expect(typeof m.title).toBe("string");
      expect(m.title.length).toBeGreaterThan(0);
      expect(typeof m.epilogue).toBe("string");
      expect(m.epilogue.length).toBeGreaterThan(50);
      expect(typeof m.icon).toBe("string");
      expect(m.icon.length).toBeGreaterThan(0);
    }
  });

  test("getEndingMeta 가 6 엔딩 모두 lookup 가능", () => {
    for (const id of [
      "main",
      "spirit",
      "fail",
      "shopkeeper",
      "goblin_friend",
      "wizard_apprentice",
    ]) {
      const m = getEndingMeta(id);
      expect(m.title).toBeTruthy();
      expect(m.epilogue).toBeTruthy();
      expect(m.icon).toBeTruthy();
    }
  });

  test("미정의 endingId 는 fallback title/epilogue/icon 반환", () => {
    const m = getEndingMeta("nonexistent");
    expect(m.title).toContain("nonexistent");
    expect(typeof m.epilogue).toBe("string");
    expect(typeof m.icon).toBe("string");
  });
});

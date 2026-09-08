// Verifying the ending metadata - the 6 base endings plus the awakening system's 5 new ones (cc57088).
// Adding or removing an ending means updating the ALL_ENDINGS list below with it.

import { describe, test, expect } from "vitest";
import { endingsMeta, getEndingMeta, type EndingMeta } from "./endings";

const ALL_ENDINGS = [
  "ascension",
  "fall",
  "harmony",
  "liberation",
  "petrification",
  "purge",
  "regency",
  "revolution",
  "sylvan_bond",
  "usurpation",
  "wayfarer",
];

describe("endingsMeta", () => {
  test("11 엔딩 모두 정의 (기본 6 + 각성 5)", () => {
    expect(Object.keys(endingsMeta).sort()).toEqual(ALL_ENDINGS);
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

  test("getEndingMeta 가 11 엔딩 모두 lookup 가능", () => {
    for (const id of ALL_ENDINGS) {
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

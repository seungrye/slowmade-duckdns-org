// #256 — world flag 부메랑 단위 테스트.

import { describe, it, expect } from "vitest";
import { buildWorldFlags, ENDING_TO_WORLD_FLAG } from "./world-flags";

describe("buildWorldFlags", () => {
  it("빈 목록 → 빈 flags", () => {
    expect(buildWorldFlags([])).toEqual({});
  });

  it("ascension 1 회 → solaris_strong true", () => {
    expect(buildWorldFlags([{ endingId: "ascension" }])).toEqual({
      "world.solaris_strong": true,
    });
  });

  it("여러 endingId → 각각 flag", () => {
    const flags = buildWorldFlags([
      { endingId: "ascension" },
      { endingId: "revolution" },
      { endingId: "sylvan_bond" },
    ]);
    expect(flags).toEqual({
      "world.solaris_strong": true,
      "world.revolution_won": true,
      "world.sylvan_awoke": true,
    });
  });

  it("같은 endingId 중복 → 한 번만 (idempotent)", () => {
    const flags = buildWorldFlags([
      { endingId: "harmony" },
      { endingId: "harmony" },
      { endingId: "harmony" },
    ]);
    expect(Object.keys(flags)).toHaveLength(1);
    expect(flags["world.harmony_kept"]).toBe(true);
  });

  it("미정의 endingId → skip", () => {
    expect(buildWorldFlags([{ endingId: "unknown_value" }])).toEqual({});
  });

  it("6 enum 모두 매핑이 정의돼 있다", () => {
    for (const e of ["ascension", "revolution", "harmony", "fall", "petrification", "sylvan_bond"] as const) {
      expect(ENDING_TO_WORLD_FLAG[e]).toMatch(/^world\./);
    }
  });
});

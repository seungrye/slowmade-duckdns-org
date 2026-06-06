// endingResolver — resolveEnding / getEndingMeta / isKnownEnding (#300).

import { describe, it, expect } from "vitest";
import { resolveEnding, getEndingMeta, isKnownEnding } from "./endingResolver";
import type { Character, GameState } from "@/types/web-adventure";

const SAMPLE_CHAR: Character = {
  stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
  hp: 10, maxHp: 10, ability: "lunar", protagonist: "kael",
  stigmaErosion: 50, inventory: [], flags: {}, rerollsLeft: 0,
};

describe("resolveEnding", () => {
  it("ended phase → endingId 반환", () => {
    const state: GameState = {
      phase: "ended",
      character: SAMPLE_CHAR,
      endingId: "harmony",
      finalSceneId: "ending_harmony",
      log: [],
    };
    expect(resolveEnding(state)).toBe("harmony");
  });

  it("creating phase → null", () => {
    expect(resolveEnding({ phase: "creating" })).toBeNull();
  });

  it("playing phase → null", () => {
    const state: GameState = {
      phase: "playing",
      character: SAMPLE_CHAR,
      currentScene: "s",
      log: [],
    };
    expect(resolveEnding(state)).toBeNull();
  });
});

describe("getEndingMeta", () => {
  it.each([
    "ascension", "revolution", "harmony", "fall", "petrification", "sylvan_bond",
  ])("%s 메타 정의 (title + icon + epilogue + aftermath)", (id) => {
    const m = getEndingMeta(id);
    expect(m.title.length).toBeGreaterThan(0);
    expect(m.icon.length).toBeGreaterThan(0);
    expect(m.epilogue.length).toBeGreaterThan(20);
    expect(m.aftermath.length).toBeGreaterThan(10);
  });

  it("미정의 endingId → fallback", () => {
    const m = getEndingMeta("unknown_xyz");
    expect(m.title).toContain("unknown_xyz");
    expect(m.icon).toBe("❓");
  });
});

describe("isKnownEnding", () => {
  it.each([
    "ascension", "revolution", "harmony", "fall", "petrification", "sylvan_bond",
  ])("%s → true", (id) => {
    expect(isKnownEnding(id)).toBe(true);
  });

  it("미정의 → false", () => {
    expect(isKnownEnding("main")).toBe(false);
    expect(isKnownEnding("")).toBe(false);
  });
});

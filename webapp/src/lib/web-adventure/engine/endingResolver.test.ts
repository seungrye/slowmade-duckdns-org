// 4 주차 RED — endingResolver helper.
// resolveEnding: ended phase 의 endingId 를 EndingId 로 narrow 해서 반환.
// getEndingMeta: 6 엔딩 모두 lookup.

import { describe, test, expect } from "vitest";
import type { Character, GameState, StatKey } from "@/types/web-adventure";
import { resolveEnding, getEndingMeta } from "./endingResolver";

function makeChar(): Character {
  const stats: Record<StatKey, number> = {
    str: 5,
    dex: 5,
    int: 5,
    cha: 5,
    con: 5,
    wis: 5,
  };
  return {
    stats,
    hp: 10,
    maxHp: 10,
    ability: "scholar",
    inventory: [],
    flags: {},
    rerollsLeft: 3,
  };
}

describe("endingResolver", () => {
  test("phase=creating 이면 null", () => {
    const state: GameState = { phase: "creating" };
    expect(resolveEnding(state)).toBeNull();
  });

  test("phase=playing 이면 null", () => {
    const state: GameState = {
      phase: "playing",
      character: makeChar(),
      currentScene: "town_square_dawn",
      log: [],
    };
    expect(resolveEnding(state)).toBeNull();
  });

  test("phase=ended 면 endingId 반환", () => {
    const state: GameState = {
      phase: "ended",
      character: makeChar(),
      endingId: "main",
      finalSceneId: "ending_main",
      log: [],
    };
    expect(resolveEnding(state)).toBe("main");
  });

  test("phase=ended + 알 수 없는 endingId 면 그대로 string 반환", () => {
    const state: GameState = {
      phase: "ended",
      character: makeChar(),
      endingId: "unknown",
      finalSceneId: "?",
      log: [],
    };
    expect(resolveEnding(state)).toBe("unknown");
  });
});

describe("endingResolver.getEndingMeta", () => {
  test("6 엔딩 모두 lookup 가능", () => {
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
});

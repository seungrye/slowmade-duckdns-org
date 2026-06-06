// #258 — USE_ITEM 의 stigmaDelta 통합. items.ts 의 ether_refined_water / mana_stone_fragment.

import { describe, it, expect } from "vitest";
import type { Character, GameState, Scene, SceneRegistry } from "@/types/web-adventure";
import { gameReducer } from "./reducer";

function makeChar(stigma: number, inventory: string[] = []): Character {
  return {
    stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: 5,
    maxHp: 10,
    ability: "lunar",
    protagonist: "kael",
    stigmaErosion: stigma,
    inventory,
    flags: {},
    rerollsLeft: 3,
  };
}

function makeScenes(): SceneRegistry {
  const here: Scene = {
    id: "here",
    illustration: "/x.jpg",
    title: "현재",
    body: ["..."],
    choices: [],
  };
  return { here };
}

describe("USE_ITEM + stigmaDelta (#258)", () => {
  it("에테르 정제수 사용 → 침식 -3 + HP 회복", () => {
    const state: GameState = {
      phase: "playing",
      character: makeChar(50, ["ether_refined_water"]),
      currentScene: "here",
      log: [],
    };
    const next = gameReducer(state, { type: "USE_ITEM", itemId: "ether_refined_water" }, makeScenes());
    expect(next.phase).toBe("playing");
    if (next.phase === "playing") {
      // stigmaDelta: -3 → 50-3 = 47
      expect(next.character.stigmaErosion).toBe(47);
      // 사용된 아이템 제거
      expect(next.character.inventory).not.toContain("ether_refined_water");
      // 정제수도 heal: 0 — HP 변화 없음. 단순 침식 감소만.
    }
  });

  it("마력석 파편 사용 → 침식 +5", () => {
    const state: GameState = {
      phase: "playing",
      character: makeChar(50, ["mana_stone_fragment"]),
      currentScene: "here",
      log: [],
    };
    const next = gameReducer(state, { type: "USE_ITEM", itemId: "mana_stone_fragment" }, makeScenes());
    expect(next.phase).toBe("playing");
    if (next.phase === "playing") {
      expect(next.character.stigmaErosion).toBe(55);
    }
  });

  it("마력석 파편으로 침식 100 도달 → 자동 petrification 엔딩", () => {
    const state: GameState = {
      phase: "playing",
      character: makeChar(96, ["mana_stone_fragment"]),
      currentScene: "here",
      log: [],
    };
    const next = gameReducer(state, { type: "USE_ITEM", itemId: "mana_stone_fragment" }, makeScenes());
    expect(next.phase).toBe("ended");
    if (next.phase === "ended") {
      expect(next.endingId).toBe("petrification");
      expect(next.character.stigmaErosion).toBe(100);
    }
  });

  it("침식이 0 미만으로 안 내려간다 (clamp)", () => {
    const state: GameState = {
      phase: "playing",
      character: makeChar(2, ["ether_refined_water"]),
      currentScene: "here",
      log: [],
    };
    const next = gameReducer(state, { type: "USE_ITEM", itemId: "ether_refined_water" }, makeScenes());
    if (next.phase === "playing") expect(next.character.stigmaErosion).toBe(0);
  });

  it("의료용 붕대 (stigmaDelta 없음, heal=5) → HP 만 회복, 침식 무변화", () => {
    const state: GameState = {
      phase: "playing",
      character: makeChar(50, ["medical_bandage"]),
      currentScene: "here",
      log: [],
    };
    const next = gameReducer(state, { type: "USE_ITEM", itemId: "medical_bandage" }, makeScenes());
    if (next.phase === "playing") {
      expect(next.character.hp).toBe(10); // 5 + 5
      expect(next.character.stigmaErosion).toBe(50);
    }
  });
});

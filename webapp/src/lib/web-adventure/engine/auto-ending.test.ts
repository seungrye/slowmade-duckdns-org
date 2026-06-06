// #318 자동 ending — HP 0 자동 fall + onEnter.hpDelta 누적 시스템.

import { describe, it, expect } from "vitest";
import type { Character, GameState, Scene, SceneRegistry } from "@/types/web-adventure";
import { gameReducer } from "./reducer";
import { isDead } from "./stigma";

function makeChar(partial: Partial<Character> = {}): Character {
  return {
    stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: 10, maxHp: 10, ability: "lunar", protagonist: "kael",
    stigmaErosion: 0, inventory: [], flags: {}, rerollsLeft: 0,
    ...partial,
  };
}

function makeScene(over: Partial<Scene> & { id: string }): Scene {
  return {
    title: over.id, illustration: "/x.svg", body: ["b"], choices: [],
    ...over,
  } as Scene;
}

describe("isDead", () => {
  it("HP 0 → true", () => {
    expect(isDead(makeChar({ hp: 0 }))).toBe(true);
  });
  it("HP -5 → true (안전 음수도)", () => {
    expect(isDead(makeChar({ hp: -5 }))).toBe(true);
  });
  it("HP 1 → false", () => {
    expect(isDead(makeChar({ hp: 1 }))).toBe(false);
  });
});

describe("HP 0 자동 fall ending (#318)", () => {
  const reg: SceneRegistry = {
    start: makeScene({ id: "start", choices: [{ kind: "plain", id: "go", label: "x", to: "trap" }] }),
    trap: makeScene({ id: "trap", onEnter: { hpDelta: -100 } }), // 진입 시 사망
  };

  it("onEnter.hpDelta 로 HP 0 도달 시 자동 fall ending", () => {
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar({ hp: 5 }), startScene: "start" }, reg);
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "go" }, reg);
    expect(state.phase).toBe("ended");
    if (state.phase === "ended") {
      expect(state.endingId).toBe("fall");
      expect(state.character.hp).toBe(0);
    }
  });

  it("HP 양수 + onEnter.hpDelta -3 = 진행 유지 (HP 7)", () => {
    const reg2: SceneRegistry = {
      start: makeScene({ id: "start", choices: [{ kind: "plain", id: "go", label: "x", to: "minor" }] }),
      minor: makeScene({ id: "minor", onEnter: { hpDelta: -3 } }),
    };
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar({ hp: 10 }), startScene: "start" }, reg2);
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "go" }, reg2);
    expect(state.phase).toBe("playing");
    if (state.phase === "playing") expect(state.character.hp).toBe(7);
  });

  it("HP cap — maxHp 초과 회복 차단", () => {
    const reg3: SceneRegistry = {
      start: makeScene({ id: "start", choices: [{ kind: "plain", id: "go", label: "x", to: "heal" }] }),
      heal: makeScene({ id: "heal", onEnter: { hpDelta: 100 } }), // 과회복
    };
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar({ hp: 5, maxHp: 10 }), startScene: "start" }, reg3);
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "go" }, reg3);
    if (state.phase !== "playing") throw new Error("expected playing");
    expect(state.character.hp).toBe(10); // maxHp cap
  });

  it("NaN/Infinity hpDelta — 차단 (기존 HP 유지)", () => {
    const reg4: SceneRegistry = {
      start: makeScene({ id: "start", choices: [{ kind: "plain", id: "go", label: "x", to: "broken" }] }),
      broken: makeScene({ id: "broken", onEnter: { hpDelta: NaN } }),
    };
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar({ hp: 8 }), startScene: "start" }, reg4);
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "go" }, reg4);
    if (state.phase !== "playing") throw new Error("expected playing");
    expect(state.character.hp).toBe(8); // 그대로
  });
});

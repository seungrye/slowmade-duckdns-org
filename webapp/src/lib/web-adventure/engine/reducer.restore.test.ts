// #288 RESTORE 보정 — 옛 localStorage 데이터 (#258 이전) 호환.

import { describe, it, expect } from "vitest";
import type { Character, GameState, SceneRegistry } from "@/types/web-adventure";
import { gameReducer } from "./reducer";

const scenes: SceneRegistry = {
  s1: { id: "s1", illustration: "/x.svg", title: "s1", body: ["b"], choices: [] },
};

function makeChar(partial: Partial<Character> = {}): Character {
  return {
    stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: 10,
    maxHp: 10,
    ability: "lunar",
    protagonist: "kael",
    stigmaErosion: 50,
    inventory: [],
    flags: {},
    rerollsLeft: 0,
    ...partial,
  };
}

describe("RESTORE 보정 (#288)", () => {
  it("정상 character 는 그대로 복원", () => {
    const initial: GameState = { phase: "creating" };
    const restored = gameReducer(
      initial,
      { type: "RESTORE", character: makeChar({ protagonist: "rin", stigmaErosion: 30 }), currentSceneId: "s1" },
      scenes,
    );
    expect(restored.phase).toBe("playing");
    if (restored.phase !== "playing") return;
    expect(restored.character.protagonist).toBe("rin");
    expect(restored.character.stigmaErosion).toBe(30);
  });

  it("옛 데이터 — protagonist 누락 시 기본 'kael' 보정", () => {
    // protagonist 가 undefined 인 옛 데이터 시뮬레이션.
    const oldChar = makeChar();
    // @ts-expect-error 강제 옛 데이터 — 옛 localStorage 의 형태 흉내.
    delete oldChar.protagonist;

    const restored = gameReducer(
      { phase: "creating" },
      { type: "RESTORE", character: oldChar, currentSceneId: "s1" },
      scenes,
    );
    if (restored.phase !== "playing") throw new Error("expected playing");
    expect(restored.character.protagonist).toBe("kael");
  });

  it("옛 데이터 — stigmaErosion 누락 시 기본 0 보정", () => {
    const oldChar = makeChar();
    // @ts-expect-error 강제 옛 데이터.
    delete oldChar.stigmaErosion;

    const restored = gameReducer(
      { phase: "creating" },
      { type: "RESTORE", character: oldChar, currentSceneId: "s1" },
      scenes,
    );
    if (restored.phase !== "playing") throw new Error("expected playing");
    expect(restored.character.stigmaErosion).toBe(0);
  });
});

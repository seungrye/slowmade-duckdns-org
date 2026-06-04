// reducer 의 상태 전환 단위 테스트.
// TDD red 단계: 구현 전 작성, 실패 확인 → 구현 → 통과.

import { describe, test, expect } from "vitest";
import type {
  AbilityKey,
  Character,
  GameState,
  SceneRegistry,
  StatKey,
} from "@/types/web-adventure";
import { gameReducer, type Action } from "./reducer";
import { scenes } from "./sceneRegistry";

function makeTestCharacter(overrides: Partial<Record<StatKey, number>> = {}, ability: AbilityKey = "scholar"): Character {
  const baseStats: Record<StatKey, number> = { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 };
  const stats: Record<StatKey, number> = { ...baseStats, ...overrides };
  return {
    stats,
    hp: 10,
    maxHp: 10,
    ability,
    inventory: [],
    flags: {},
    rerollsLeft: 3,
  };
}

describe("gameReducer", () => {
  test("START_GAME 액션이 creating → playing 으로 전환된다", () => {
    const initial: GameState = { phase: "creating" };
    const character = makeTestCharacter({ str: 7 });
    const next = gameReducer(
      initial,
      { type: "START_GAME", character, startScene: "town_square_dawn" },
      scenes as SceneRegistry,
    );
    expect(next.phase).toBe("playing");
    if (next.phase === "playing") {
      expect(next.character.stats.str).toBe(7);
      expect(next.currentScene).toBe("town_square_dawn");
    }
  });

  test("MAKE_CHOICE plain 액션이 to 씬으로 이동한다", () => {
    const state: GameState = {
      phase: "playing",
      character: makeTestCharacter(),
      currentScene: "town_square_dawn",
      log: [],
    };
    const next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "to_elder" },
      scenes as SceneRegistry,
    );
    // elder_ending 이 isEnding=true 이므로 ended 로 즉시 전환
    expect(next.phase).toBe("ended");
    if (next.phase === "ended") expect(next.endingId).toBe("main");
  });

  test("MAKE_CHOICE probability 액션이 성공 시 onSuccess 씬으로 이동한다", () => {
    // probability 선택지: dex 12 — onSuccess/onFailure 둘 다 elder_ending (PoC).
    // 모든 굴림이 성공해도 elder_ending(=isEnding) 에 도달 → ended 로 자동 전환.
    const state: GameState = {
      phase: "playing",
      character: makeTestCharacter({ dex: 10 }),
      currentScene: "town_square_dawn",
      log: [],
    };
    const next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "scout_market", rng: () => 0.99 },
      scenes as SceneRegistry,
    );
    expect(next.phase).toBe("ended");
    if (next.phase === "ended") {
      expect(next.finalSceneId).toBe("elder_ending");
    }
  });

  test("MAKE_CHOICE conditional 조건 미충족이면 상태 유지", () => {
    const lowWisChar = makeTestCharacter({ wis: 5 });
    const state: GameState = {
      phase: "playing",
      character: lowWisChar,
      currentScene: "town_square_dawn",
      log: [],
    };
    const next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "secret_shrine" },
      scenes as SceneRegistry,
    );
    expect(next).toEqual(state); // 조건 미충족 → 무변화
  });

  test("MAKE_CHOICE conditional 조건 충족이면 to 씬으로 이동한다", () => {
    const highWisChar = makeTestCharacter({ wis: 8 });
    const state: GameState = {
      phase: "playing",
      character: highWisChar,
      currentScene: "town_square_dawn",
      log: [],
    };
    const next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "secret_shrine" },
      scenes as SceneRegistry,
    );
    // elder_ending(=isEnding) → ended 자동 전환
    expect(next.phase).toBe("ended");
  });

  test("END_GAME 액션이 ended phase 로 전환된다", () => {
    const state: GameState = {
      phase: "playing",
      character: makeTestCharacter(),
      currentScene: "elder_ending",
      log: [],
    };
    const next = gameReducer(
      state,
      { type: "END_GAME", endingId: "main" },
      scenes as SceneRegistry,
    );
    expect(next.phase).toBe("ended");
    if (next.phase === "ended") {
      expect(next.endingId).toBe("main");
      expect(next.finalSceneId).toBe("elder_ending");
    }
  });

  test("알 수 없는 액션은 상태를 유지한다", () => {
    const state: GameState = {
      phase: "playing",
      character: makeTestCharacter(),
      currentScene: "town_square_dawn",
      log: [],
    };
    const next = gameReducer(state, { type: "UNKNOWN" } as unknown as Action, scenes as SceneRegistry);
    expect(next).toEqual(state);
  });

  test("creating phase 에서 MAKE_CHOICE 는 무시된다", () => {
    const initial: GameState = { phase: "creating" };
    const next = gameReducer(
      initial,
      { type: "MAKE_CHOICE", choiceId: "to_elder" },
      scenes as SceneRegistry,
    );
    expect(next).toEqual(initial);
  });

  test("존재하지 않는 choiceId 는 상태를 유지한다", () => {
    const state: GameState = {
      phase: "playing",
      character: makeTestCharacter(),
      currentScene: "town_square_dawn",
      log: [],
    };
    const next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "no_such_choice" },
      scenes as SceneRegistry,
    );
    expect(next).toEqual(state);
  });
});

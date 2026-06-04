// 시나리오 테스트 — 2 주차 분기/엔딩 전 흐름 검증.
// rng 고정으로 운빨 회피.
// red 단계: 해당 씬/엔딩이 없으므로 실패해야 정상.

import { describe, test, expect } from "vitest";
import type {
  AbilityKey,
  Character,
  GameState,
  StatKey,
} from "@/types/web-adventure";
import { gameReducer } from "@/lib/web-adventure/engine/reducer";
import { scenes, START_SCENE_ID } from "@/lib/web-adventure/engine/sceneRegistry";

function makeTestCharacter(
  overrides: Partial<Record<StatKey, number>> = {},
  ability: AbilityKey = "scholar",
): Character {
  const baseStats: Record<StatKey, number> = {
    str: 5,
    dex: 5,
    int: 5,
    cha: 5,
    con: 5,
    wis: 5,
  };
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

function startGame(character: Character): GameState {
  return gameReducer(
    { phase: "creating" },
    { type: "START_GAME", character, startScene: START_SCENE_ID },
    scenes,
  );
}

function makeChoice(
  state: GameState,
  choiceId: string,
  rng: () => number = () => 0.5,
): GameState {
  return gameReducer(state, { type: "MAKE_CHOICE", choiceId, rng }, scenes);
}

describe("web-adventure 시나리오", () => {
  test("성공 path: 광장 → 시장 → 잠입 성공 → 장로 집 → 메인 엔딩", () => {
    const fixedRng = () => 0.99; // 성공 강제
    let state: GameState = startGame(makeTestCharacter({ dex: 10 }));
    expect(state.phase).toBe("playing");
    if (state.phase === "playing") expect(state.currentScene).toBe("town_square_dawn");

    state = makeChoice(state, "to_market", fixedRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("market_morning");

    state = makeChoice(state, "sneak_storage", fixedRng);
    if (state.phase === "playing") {
      expect(state.currentScene).toBe("market_storage_success");
      expect(state.character.flags.hasSecretSnack).toBe(true);
    }

    state = makeChoice(state, "to_elder", fixedRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("elder_house_arrival");

    state = makeChoice(state, "give_snack", fixedRng);
    expect(state.phase).toBe("ended");
    if (state.phase === "ended") expect(state.endingId).toBe("main");
  });

  test("실패 path: 광장 → 시장 → 잠입 실패 → 광장 → 숲 → 산신령 성공 → 비밀 엔딩", () => {
    const lowRng = () => 0.0; // 실패 강제
    const highRng = () => 0.99; // 성공 강제

    let state: GameState = startGame(makeTestCharacter({ dex: 5, wis: 10 }));

    state = makeChoice(state, "to_market", lowRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("market_morning");

    state = makeChoice(state, "sneak_storage", lowRng);
    if (state.phase === "playing") {
      expect(state.currentScene).toBe("market_caught");
      expect(state.character.flags.caughtBefore).toBe(true);
    }

    state = makeChoice(state, "retreat", lowRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("town_square_dawn");

    state = makeChoice(state, "to_forest", lowRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("forest_entry");

    state = makeChoice(state, "meet_spirit", highRng);
    expect(state.phase).toBe("ended");
    if (state.phase === "ended") expect(state.endingId).toBe("spirit");
  });

  test("conditional 차단: 비밀 간식 없이 장로집 방문 시 give_snack 차단", () => {
    let state: GameState = startGame(makeTestCharacter());

    state = makeChoice(state, "to_elder_house");
    if (state.phase === "playing") expect(state.currentScene).toBe("elder_house_arrival");

    // give_snack — flag 없으므로 무변화
    const before = state;
    state = makeChoice(state, "give_snack");
    expect(state).toEqual(before);

    // back_square 는 가능
    state = makeChoice(state, "back_square");
    if (state.phase === "playing") expect(state.currentScene).toBe("town_square_dawn");
  });

  test("숲 실패 후 다시 광장으로 수렴", () => {
    const lowRng = () => 0.0;
    let state: GameState = startGame(makeTestCharacter({ wis: 5 }));

    state = makeChoice(state, "to_forest", lowRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("forest_entry");

    state = makeChoice(state, "meet_spirit", lowRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("forest_lost");

    state = makeChoice(state, "back", lowRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("town_square_dawn");
  });
});

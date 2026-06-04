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
      // 3 주차: flag → item 으로 변경.
      expect(state.currentScene).toBe("market_storage_success");
      expect(state.character.inventory).toContain("super_tintham_cracker");
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

  // 3 주차 시나리오.

  test("패시브 안경 보유 시 숲 깊은 곳 분기 진입 가능 (forest_inner_with_glasses)", () => {
    // 1. 광장 → 숲 입구 → 깊은 숲 (forest_inner). 안경 사전 보유 (시작 인벤 강제 주입).
    // 2. forest_inner 에서 conditional hasItem spirit_glasses 가 활성화 → forest_inner_with_glasses.
    const char = makeTestCharacter({ wis: 5 });
    char.inventory = ["spirit_glasses"];
    let state: GameState = startGame(char);

    state = makeChoice(state, "to_forest");
    if (state.phase === "playing") expect(state.currentScene).toBe("forest_entry");

    state = makeChoice(state, "go_deeper");
    if (state.phase === "playing") expect(state.currentScene).toBe("forest_inner");

    state = makeChoice(state, "see_with_glasses");
    if (state.phase === "playing") expect(state.currentScene).toBe("forest_inner_with_glasses");

    state = makeChoice(state, "meet_spirit_directly");
    expect(state.phase).toBe("ended");
    if (state.phase === "ended") expect(state.endingId).toBe("spirit");
  });

  test("동굴 진입 시 횃불 없으면 conditional 차단 (cave_inside 잠김)", () => {
    let state: GameState = startGame(makeTestCharacter());

    state = makeChoice(state, "to_cave");
    if (state.phase === "playing") expect(state.currentScene).toBe("cave_entry");

    // torch 없음 — enter_with_torch 차단. 상태 유지.
    const before = state;
    state = makeChoice(state, "enter_with_torch");
    expect(state).toEqual(before);
  });

  test("도깨비 카리스마 12 성공 → goblin_charm 획득 → goblin_friend 엔딩", () => {
    const highRng = () => 0.99;
    const char = makeTestCharacter({ cha: 8 });
    char.inventory = ["torch"];
    let state: GameState = startGame(char);

    state = makeChoice(state, "to_cave");
    if (state.phase === "playing") expect(state.currentScene).toBe("cave_entry");

    state = makeChoice(state, "enter_with_torch");
    if (state.phase === "playing") expect(state.currentScene).toBe("cave_inside");

    state = makeChoice(state, "meet_goblin", highRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("goblin_encounter");

    state = makeChoice(state, "befriend_goblin", highRng);
    expect(state.phase).toBe("ended");
    if (state.phase === "ended") expect(state.endingId).toBe("goblin_friend");
  });
});

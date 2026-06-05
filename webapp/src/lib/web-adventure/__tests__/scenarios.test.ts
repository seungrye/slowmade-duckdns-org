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

  // 3 주차 미니 fix — 막힌 아이템 경로 풀기.

  test("시장에서 물건을 사면 bread + torch + herb 3 개가 인벤에 들어온다", () => {
    let state: GameState = startGame(makeTestCharacter());
    state = makeChoice(state, "to_market");
    state = makeChoice(state, "buy_supplies");
    if (state.phase === "playing") {
      expect(state.currentScene).toBe("market_buy");
      expect(state.character.inventory).toContain("bread");
      expect(state.character.inventory).toContain("torch");
      expect(state.character.inventory).toContain("herb");
    }
  });

  test("시장에서 torch 획득 후 동굴 진입 가능 (cave_inside 도달)", () => {
    let state: GameState = startGame(makeTestCharacter());
    state = makeChoice(state, "to_market");
    state = makeChoice(state, "buy_supplies");
    state = makeChoice(state, "back_to_square");
    if (state.phase === "playing") expect(state.currentScene).toBe("town_square_dawn");
    state = makeChoice(state, "to_cave");
    if (state.phase === "playing") expect(state.currentScene).toBe("cave_entry");
    state = makeChoice(state, "enter_with_torch");
    if (state.phase === "playing") expect(state.currentScene).toBe("cave_inside");
  });

  test("도깨비 친구 엔딩 도달 (시장 torch 획득 → 동굴 → 도깨비 cha 판정 ✓)", () => {
    const fixedRng = () => 0.99;
    let state: GameState = startGame(makeTestCharacter({ cha: 8 }));
    state = makeChoice(state, "to_market", fixedRng);
    state = makeChoice(state, "buy_supplies", fixedRng);
    state = makeChoice(state, "back_to_square", fixedRng);
    state = makeChoice(state, "to_cave", fixedRng);
    state = makeChoice(state, "enter_with_torch", fixedRng);
    state = makeChoice(state, "meet_goblin", fixedRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("goblin_encounter");
    state = makeChoice(state, "befriend_goblin", fixedRng);
    expect(state.phase).toBe("ended");
    if (state.phase === "ended") expect(state.endingId).toBe("goblin_friend");
  });

  test("숲 wis 판정 ✓ → spirit_glasses 획득 → forest_find_glasses 진입", () => {
    const fixedRng = () => 0.99;
    let state: GameState = startGame(makeTestCharacter({ wis: 7 }));
    state = makeChoice(state, "to_forest", fixedRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("forest_entry");
    state = makeChoice(state, "go_deeper", fixedRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("forest_inner");
    state = makeChoice(state, "look_around", fixedRng);
    if (state.phase === "playing") {
      expect(state.currentScene).toBe("forest_find_glasses");
      expect(state.character.inventory).toContain("spirit_glasses");
    }
  });

  // ─── 4 주차 — 신규 엔딩 시나리오 ───────────────────────────────────────

  test("fail 엔딩 도달 (시장 잠입 실패 3 회 → 추방)", () => {
    const lowRng = () => 0.0;
    let state: GameState = startGame(makeTestCharacter({ dex: 3 }));

    // 1차 들킴
    state = makeChoice(state, "to_market", lowRng);
    state = makeChoice(state, "sneak_storage", lowRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("market_caught");
    state = makeChoice(state, "retreat", lowRng);

    // 2차 들킴
    state = makeChoice(state, "to_market", lowRng);
    state = makeChoice(state, "sneak_storage", lowRng);
    state = makeChoice(state, "retreat", lowRng);

    // 3차 들킴 — 이번엔 market_caught 에서 dark_alley 선택 (뒷골목) → ending_fail
    state = makeChoice(state, "to_market", lowRng);
    state = makeChoice(state, "sneak_storage", lowRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("market_caught");
    if (state.phase === "playing") {
      expect(state.character.flags.caughtBefore).toBe(true);
      // 3회 누적 카운트 검증 — flag 누적용 caughtCount.
      expect((state.character.flags as Record<string, unknown>).caughtCount).toBeDefined();
    }
    state = makeChoice(state, "to_back_alley", lowRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("market_back_alley");
    state = makeChoice(state, "to_fail", lowRng);
    expect(state.phase).toBe("ended");
    if (state.phase === "ended") expect(state.endingId).toBe("fail");
  });

  test("shopkeeper 엔딩 도달 (광장 → 행상인 → 정착 선택)", () => {
    const highRng = () => 0.99;
    let state: GameState = startGame(makeTestCharacter({ cha: 9 }));

    state = makeChoice(state, "to_peddler", highRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("peddler");

    state = makeChoice(state, "settle_market", highRng);
    expect(state.phase).toBe("ended");
    if (state.phase === "ended") expect(state.endingId).toBe("shopkeeper");
  });

  test("wizard_apprentice 엔딩 도달 (산기슭 → 마법사 wis 11 ✓ → int 13 ✓ → 제자)", () => {
    const highRng = () => 0.99;
    let state: GameState = startGame(makeTestCharacter({ wis: 9, int: 10 }));

    state = makeChoice(state, "to_mountain_foot", highRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("mountain_foot");

    state = makeChoice(state, "find_wizard", highRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("wizard_meeting");

    state = makeChoice(state, "become_apprentice", highRng);
    expect(state.phase).toBe("ended");
    if (state.phase === "ended") expect(state.endingId).toBe("wizard_apprentice");
  });

  test("conditional hidden=true: 산기슭 → 마법사 미충족 시 선택지 자체가 없음", () => {
    // wis 5 라 probability 실패 — find_wizard 가 plain 으로 노출되지 않음.
    const lowRng = () => 0.0;
    let state: GameState = startGame(makeTestCharacter({ wis: 5 }));
    state = makeChoice(state, "to_mountain_foot", lowRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("mountain_foot");
    // 실패 시 *광장 복귀*.
    state = makeChoice(state, "find_wizard", lowRng);
    // 실패 분기 → 광장 복귀.
    if (state.phase === "playing") expect(state.currentScene).toBe("town_square_dawn");
  });

  test("companion_meeting 카리 12 ✓ → companion_token 획득", () => {
    const highRng = () => 0.99;
    let state: GameState = startGame(makeTestCharacter({ cha: 10 }));

    state = makeChoice(state, "to_companion", highRng);
    if (state.phase === "playing") expect(state.currentScene).toBe("companion_meeting");

    state = makeChoice(state, "befriend_companion", highRng);
    if (state.phase === "playing") {
      expect(state.character.inventory).toContain("companion_token");
    }
  });

  test("회차 6 종 모두 도달 가능 — 6 엔딩 모두 sceneRegistry 에 존재한다", () => {
    const ids = Object.values(scenes)
      .filter((s) => s.isEnding)
      .map((s) => s.endingId)
      .filter(Boolean);
    expect(new Set(ids)).toEqual(
      new Set(["main", "spirit", "fail", "shopkeeper", "goblin_friend", "wizard_apprentice"]),
    );
  });

  test("USE_ITEM bread 시 HP +20 회복 및 인벤에서 제거", () => {
    let state: GameState = startGame(makeTestCharacter());
    state = makeChoice(state, "to_market");
    state = makeChoice(state, "buy_supplies");
    if (state.phase === "playing") {
      expect(state.character.inventory).toContain("bread");
      // 임의로 HP 감소.
      state = {
        ...state,
        character: { ...state.character, hp: 5, maxHp: 30 },
      };
    }
    state = gameReducer(state, { type: "USE_ITEM", itemId: "bread" }, scenes);
    if (state.phase === "playing") {
      expect(state.character.hp).toBe(25); // 5 + 20 = 25, max 30 미만이라 그대로.
      expect(state.character.inventory).not.toContain("bread");
    }
  });
});

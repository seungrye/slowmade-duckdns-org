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
    // 2 주차: town_square_dawn → to_market → market_morning (isEnding=false)
    const state: GameState = {
      phase: "playing",
      character: makeTestCharacter(),
      currentScene: "town_square_dawn",
      log: [],
    };
    const next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "to_market" },
      scenes as SceneRegistry,
    );
    expect(next.phase).toBe("playing");
    if (next.phase === "playing") {
      expect(next.currentScene).toBe("market_morning");
    }
  });

  test("MAKE_CHOICE plain 액션이 isEnding 씬에 도달하면 ended 로 전환된다", () => {
    // 장로 집 도착 → 비밀 간식 보유 시 give_snack (conditional) → ending_main (isEnding=true)
    // 3 주차: flag → hasItem super_tintham_cracker.
    const state: GameState = {
      phase: "playing",
      character: makeTestCharacter({}, "scholar"),
      currentScene: "elder_house_arrival",
      log: [],
    };
    const charWithItem = { ...state.character, inventory: ["super_tintham_cracker"] };
    const next = gameReducer(
      { ...state, character: charWithItem },
      { type: "MAKE_CHOICE", choiceId: "give_snack" },
      scenes as SceneRegistry,
    );
    expect(next.phase).toBe("ended");
    if (next.phase === "ended") expect(next.endingId).toBe("main");
  });

  test("MAKE_CHOICE probability 액션이 성공 시 onSuccess 씬으로 이동한다", () => {
    // market_morning 의 sneak_storage: dex 12 — onSuccess: market_storage_success
    const state: GameState = {
      phase: "playing",
      character: makeTestCharacter({ dex: 10 }),
      currentScene: "market_morning",
      log: [],
    };
    const next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "sneak_storage", rng: () => 0.99 },
      scenes as SceneRegistry,
    );
    expect(next.phase).toBe("playing");
    if (next.phase === "playing") {
      expect(next.currentScene).toBe("market_storage_success");
    }
  });

  test("MAKE_CHOICE probability 액션이 실패 시 onFailure 씬으로 이동한다", () => {
    const state: GameState = {
      phase: "playing",
      character: makeTestCharacter({ dex: 5 }),
      currentScene: "market_morning",
      log: [],
    };
    const next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "sneak_storage", rng: () => 0.0 },
      scenes as SceneRegistry,
    );
    expect(next.phase).toBe("playing");
    if (next.phase === "playing") {
      expect(next.currentScene).toBe("market_caught");
    }
  });

  test("MAKE_CHOICE conditional 조건 미충족이면 상태 유지", () => {
    // elder_house_arrival 의 give_snack 은 hasSecretSnack flag 필요.
    const state: GameState = {
      phase: "playing",
      character: makeTestCharacter(),
      currentScene: "elder_house_arrival",
      log: [],
    };
    const next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "give_snack" },
      scenes as SceneRegistry,
    );
    expect(next).toEqual(state); // 조건 미충족 → 무변화
  });

  test("MAKE_CHOICE conditional 조건 충족이면 to 씬으로 이동한다", () => {
    // 3 주차: flag → hasItem super_tintham_cracker.
    const charWithItem = {
      ...makeTestCharacter(),
      inventory: ["super_tintham_cracker"],
    };
    const state: GameState = {
      phase: "playing",
      character: charWithItem,
      currentScene: "elder_house_arrival",
      log: [],
    };
    const next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "give_snack" },
      scenes as SceneRegistry,
    );
    // ending_main(=isEnding) → ended 자동 전환
    expect(next.phase).toBe("ended");
    if (next.phase === "ended") expect(next.endingId).toBe("main");
  });

  test("END_GAME 액션이 ended phase 로 전환된다", () => {
    const state: GameState = {
      phase: "playing",
      character: makeTestCharacter(),
      currentScene: "town_square_dawn",
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
      expect(next.finalSceneId).toBe("town_square_dawn");
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
      { type: "MAKE_CHOICE", choiceId: "to_market" },
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

  // 2 주차 추가 — onEnter / RESET / probability 실패 분기 + conditional 차단.

  test("onEnter addItems 가 목적지 씬 진입 시 character.inventory 에 반영된다", () => {
    // 3 주차: market_storage_success → addItems: ["super_tintham_cracker"]
    const fixedRng = () => 0.99; // 높은 굴림 = 성공 강제
    const state: GameState = {
      phase: "playing",
      character: makeTestCharacter({ dex: 10 }),
      currentScene: "market_morning",
      log: [],
    };
    const next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "sneak_storage", rng: fixedRng },
      scenes as SceneRegistry,
    );
    expect(next.phase).toBe("playing");
    if (next.phase === "playing") {
      expect(next.currentScene).toBe("market_storage_success");
      expect(next.character.inventory).toContain("super_tintham_cracker");
    }
  });

  test("onEnter setFlags 실패 분기 — market_caught 도 flags 반영", () => {
    const fixedRng = () => 0.0; // 낮은 굴림 = 실패 강제
    const state: GameState = {
      phase: "playing",
      character: makeTestCharacter({ dex: 5 }),
      currentScene: "market_morning",
      log: [],
    };
    const next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "sneak_storage", rng: fixedRng },
      scenes as SceneRegistry,
    );
    expect(next.phase).toBe("playing");
    if (next.phase === "playing") {
      expect(next.currentScene).toBe("market_caught");
      expect(next.character.flags.caughtBefore).toBe(true);
    }
  });

  test("RESET 액션이 어느 phase 에서든 creating 으로 전환한다", () => {
    const playing: GameState = {
      phase: "playing",
      character: makeTestCharacter(),
      currentScene: "town_square_dawn",
      log: ["선택: ..."],
    };
    const afterReset = gameReducer(playing, { type: "RESET" }, scenes as SceneRegistry);
    expect(afterReset).toEqual({ phase: "creating" });

    const ended: GameState = {
      phase: "ended",
      character: makeTestCharacter(),
      endingId: "main",
      finalSceneId: "ending_main",
      log: [],
    };
    const afterReset2 = gameReducer(ended, { type: "RESET" }, scenes as SceneRegistry);
    expect(afterReset2).toEqual({ phase: "creating" });
  });

  test("conditional 차단: flag 없으면 give_snack 무시", () => {
    // elder_house_arrival 의 give_snack 은 *hasItem super_tintham_cracker* 로 변경 (3 주차).
    const state: GameState = {
      phase: "playing",
      character: makeTestCharacter(),
      currentScene: "elder_house_arrival",
      log: [],
    };
    const next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "give_snack" },
      scenes as SceneRegistry,
    );
    // 조건 미충족 → 상태 유지
    expect(next).toEqual(state);
  });

  // 3 주차 RED 추가.

  test("hasItem 조건으로 super_tintham_cracker 보유 시 give_snack 가능 (flag 대체)", () => {
    // market_storage_success 의 onEnter 가 addItems: ["super_tintham_cracker"] 로 변경.
    // elder_house_arrival 의 give_snack 은 hasItem super_tintham_cracker 로 변경.
    const charWithItem = {
      ...makeTestCharacter(),
      inventory: ["super_tintham_cracker"],
    };
    const state: GameState = {
      phase: "playing",
      character: charWithItem,
      currentScene: "elder_house_arrival",
      log: [],
    };
    const next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "give_snack" },
      scenes as SceneRegistry,
    );
    expect(next.phase).toBe("ended");
    if (next.phase === "ended") expect(next.endingId).toBe("main");
  });

  test("market_storage_success 진입 시 super_tintham_cracker 가 인벤에 추가된다", () => {
    const fixedRng = () => 0.99;
    const state: GameState = {
      phase: "playing",
      character: makeTestCharacter({ dex: 10 }),
      currentScene: "market_morning",
      log: [],
    };
    const next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "sneak_storage", rng: fixedRng },
      scenes as SceneRegistry,
    );
    expect(next.phase).toBe("playing");
    if (next.phase === "playing") {
      expect(next.currentScene).toBe("market_storage_success");
      expect(next.character.inventory).toContain("super_tintham_cracker");
    }
  });

  test("REROLL 액션이 rerollsLeft 를 1 감소시키고 다시 굴린다", () => {
    // lucky 어빌 + dex 5 + 실패 굴림. REROLL 시 rerollsLeft 감소.
    const lucky = makeTestCharacter({}, "lucky");
    lucky.rerollsLeft = 3;
    // 초기 실패: market_caught
    const state: GameState = {
      phase: "playing",
      character: lucky,
      currentScene: "market_morning",
      log: [],
    };
    const failed = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "sneak_storage", rng: () => 0.0 },
      scenes as SceneRegistry,
    );
    expect(failed.phase).toBe("playing");
    if (failed.phase === "playing") {
      expect(failed.currentScene).toBe("market_caught");
    }
    // REROLL — market_morning 로 복귀해서 다시 시도, rerollsLeft -1.
    // (단순 설계: REROLL 은 *마지막 choice* 를 다시 굴리며 *이전 씬* 로 되돌림.)
    const rerolled = gameReducer(
      failed,
      { type: "REROLL", rng: () => 0.99 },
      scenes as SceneRegistry,
    );
    expect(rerolled.phase).toBe("playing");
    if (rerolled.phase === "playing") {
      expect(rerolled.character.rerollsLeft).toBe(2);
      // 재굴림 성공 → market_storage_success
      expect(rerolled.currentScene).toBe("market_storage_success");
    }
  });

  // #238 — 저장에서 불러오기.
  test("RESTORE 는 character + currentSceneId 로 playing state 를 즉시 복원한다", () => {
    const character = makeTestCharacter({}, "scholar");
    character.hp = 7;
    character.inventory = ["torch"];
    const restored = gameReducer(
      { phase: "creating" },
      { type: "RESTORE", character, currentSceneId: "cave_entry" },
      scenes as SceneRegistry,
    );
    expect(restored.phase).toBe("playing");
    if (restored.phase === "playing") {
      expect(restored.currentScene).toBe("cave_entry");
      expect(restored.character.hp).toBe(7);
      expect(restored.character.inventory).toContain("torch");
      expect(restored.log).toEqual([]);
    }
  });

  test("REROLL 은 rerollsLeft 가 0 이면 무효", () => {
    const noReroll = makeTestCharacter({}, "scholar");
    noReroll.rerollsLeft = 0;
    const state: GameState = {
      phase: "playing",
      character: noReroll,
      currentScene: "market_morning",
      log: [],
    };
    const failed = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "sneak_storage", rng: () => 0.0 },
      scenes as SceneRegistry,
    );
    // REROLL — 무효, 상태 유지.
    const rerolled = gameReducer(failed, { type: "REROLL", rng: () => 0.99 }, scenes as SceneRegistry);
    expect(rerolled).toEqual(failed);
  });
});

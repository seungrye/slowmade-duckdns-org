// #306 reducer 직접 단위 — START_GAME / MAKE_CHOICE / RESET / REROLL.
//
// 기존 간접 테스트 (use-item, stigma, restore, integration-e2e) 외에 *액션 단위* 직접
// 검증. 회귀 회피용.

import { describe, it, expect } from "vitest";
import type {
  Character,
  GameState,
  Scene,
  SceneRegistry,
} from "@/types/web-adventure";
import { gameReducer } from "./reducer";

function makeChar(partial: Partial<Character> = {}): Character {
  return {
    stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: 10, maxHp: 10, ability: "lunar", protagonist: "kael",
    stigmaErosion: 0, inventory: [], flags: {}, rerollsLeft: 1,
    ...partial,
  };
}

function makeScene(over: Partial<Scene> & { id: string }): Scene {
  return {
    
    title: over.id,
    illustration: "/x.svg",
    body: ["b"],
    choices: [],
    ...over,
  } as Scene;
}

describe("START_GAME", () => {
  const scenes: SceneRegistry = {
    s1: makeScene({ id: "s1", title: "시작" }),
  };

  it("creating → playing 으로 전환", () => {
    const state: GameState = { phase: "creating" };
    const next = gameReducer(
      state,
      { type: "START_GAME", character: makeChar(), startScene: "s1" },
      scenes,
    );
    expect(next.phase).toBe("playing");
    if (next.phase !== "playing") return;
    expect(next.currentScene).toBe("s1");
    expect(next.character.protagonist).toBe("kael");
    // #348 — log = ▶ 제목 (id) + 들여쓰기 본문.
    expect(next.log[0]).toBe("▶ 시작 (s1)");
    expect(next.log[1]).toMatch(/^ {2}/);
  });

  it("playing 상태에서 START_GAME → 무시", () => {
    const state: GameState = {
      phase: "playing", character: makeChar(), currentScene: "s1", log: [],
    };
    const next = gameReducer(
      state,
      { type: "START_GAME", character: makeChar({ protagonist: "rin" }), startScene: "s1" },
      scenes,
    );
    expect(next).toEqual(state); // 무변화
  });

  it("startScene 미존재 시 → state 무변화 (방어)", () => {
    const next = gameReducer(
      { phase: "creating" },
      { type: "START_GAME", character: makeChar(), startScene: "missing" },
      scenes,
    );
    expect(next).toEqual({ phase: "creating" });
  });

  it("startScene 의 onEnter.setFlags 자동 적용", () => {
    const reg: SceneRegistry = {
      start: makeScene({
        id: "start",
        onEnter: { setFlags: { isStarted: true } },
      }),
    };
    const next = gameReducer(
      { phase: "creating" },
      { type: "START_GAME", character: makeChar(), startScene: "start" },
      reg,
    );
    if (next.phase !== "playing") throw new Error("expected playing");
    expect(next.character.flags.isStarted).toBe(true);
  });
});

describe("MAKE_CHOICE — plain", () => {
  it("to 의 씬으로 이동", () => {
    const reg: SceneRegistry = {
      a: makeScene({ id: "a", choices: [{ kind: "plain", id: "go", label: "go", to: "b" }] }),
      b: makeScene({ id: "b" }),
    };
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar(), startScene: "a" }, reg);
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "go" }, reg);
    if (state.phase !== "playing") throw new Error("expected playing");
    expect(state.currentScene).toBe("b");
  });

  it("이동한 씬이 isEnding=true → ended", () => {
    const reg: SceneRegistry = {
      a: makeScene({ id: "a", choices: [{ kind: "plain", id: "fin", label: "fin", to: "end" }] }),
      end: makeScene({ id: "end", isEnding: true, endingId: "harmony" }),
    };
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar(), startScene: "a" }, reg);
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "fin" }, reg);
    expect(state.phase).toBe("ended");
    if (state.phase === "ended") expect(state.endingId).toBe("harmony");
  });
});

describe("MAKE_CHOICE — probability", () => {
  const reg: SceneRegistry = {
    a: makeScene({
      id: "a",
      choices: [{
        kind: "probability", id: "roll", label: "roll",
        stat: "str", difficulty: 12,
        onSuccess: "ok", onFailure: "fail",
      }],
    }),
    ok: makeScene({ id: "ok" }),
    fail: makeScene({ id: "fail" }),
  };

  it("RNG 0.99 (roll 20) → 성공 → onSuccess", () => {
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar(), startScene: "a" }, reg);
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "roll", rng: () => 0.99 }, reg);
    if (state.phase !== "playing") throw new Error("expected playing");
    expect(state.currentScene).toBe("ok");
  });

  it("RNG 0 (roll 1) → 실패 → onFailure", () => {
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar(), startScene: "a" }, reg);
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "roll", rng: () => 0 }, reg);
    if (state.phase !== "playing") throw new Error("expected playing");
    expect(state.currentScene).toBe("fail");
  });
});

describe("MAKE_CHOICE — conditional", () => {
  const reg: SceneRegistry = {
    a: makeScene({
      id: "a",
      choices: [{
        kind: "conditional", id: "cd", label: "조건",
        condition: { kind: "minStat", stat: "wis", min: 7 },
        to: "next",
      }],
    }),
    next: makeScene({ id: "next" }),
  };

  it("조건 충족 → 통과", () => {
    let state: GameState = { phase: "creating" };
    state = gameReducer(
      state,
      { type: "START_GAME", character: makeChar({ stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 7 } }), startScene: "a" },
      reg,
    );
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "cd" }, reg);
    if (state.phase !== "playing") throw new Error("expected playing");
    expect(state.currentScene).toBe("next");
  });

  it("조건 미달 → state 무변화 (분기 차단)", () => {
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar(), startScene: "a" }, reg);
    const before = state;
    const after = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "cd" }, reg);
    expect(after).toEqual(before);
  });
});

describe("RESET", () => {
  it("어떤 phase 에서도 creating 으로 reset", () => {
    const s1: GameState = { phase: "ended", character: makeChar(), endingId: "harmony", finalSceneId: "x", log: [] };
    expect(gameReducer(s1, { type: "RESET" }, {})).toEqual({ phase: "creating" });

    const s2: GameState = { phase: "playing", character: makeChar(), currentScene: "x", log: [] };
    expect(gameReducer(s2, { type: "RESET" }, {})).toEqual({ phase: "creating" });
  });
});

describe("REROLL", () => {
  it("playing + 직전 probability 성공 후 재굴림 → 다른 결과 가능 + rerollsLeft -1", () => {
    const reg: SceneRegistry = {
      a: makeScene({
        id: "a",
        choices: [{
          kind: "probability", id: "roll", label: "roll",
          stat: "str", difficulty: 18, // 어려움
          onSuccess: "ok", onFailure: "fail",
        }],
      }),
      ok: makeScene({ id: "ok" }),
      fail: makeScene({ id: "fail" }),
    };
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar({ rerollsLeft: 2 }), startScene: "a" }, reg);
    // 실패 (RNG 0)
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "roll", rng: () => 0 }, reg);
    if (state.phase !== "playing") throw new Error("expected playing");
    expect(state.currentScene).toBe("fail");
    const charBefore = state.character;
    // REROLL — RNG 0.99 (roll 20) 성공
    state = gameReducer(state, { type: "REROLL", rng: () => 0.99 }, reg);
    if (state.phase !== "playing") throw new Error("expected playing");
    expect(state.currentScene).toBe("ok");
    expect(state.character.rerollsLeft).toBe(charBefore.rerollsLeft - 1);
  });
});

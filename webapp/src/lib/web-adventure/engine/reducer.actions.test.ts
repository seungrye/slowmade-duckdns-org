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

  it("onEnter.setVars → character.variables 병합({{키}} 치환 소스)", () => {
    const reg: SceneRegistry = {
      a: makeScene({ id: "a", choices: [{ kind: "plain", id: "go", label: "go", to: "b" }] }),
      b: makeScene({ id: "b", onEnter: { setVars: { route: "정문 초소", n: 3 } } }),
    };
    let state: GameState = gameReducer(
      { phase: "creating" },
      { type: "START_GAME", character: makeChar({ variables: { keep: "값" } }), startScene: "a" },
      reg,
    );
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "go" }, reg);
    if (state.phase !== "playing") throw new Error("expected playing");
    expect(state.character.variables).toEqual({ keep: "값", route: "정문 초소", n: 3 });
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

  it("RNG 0.99 → pendingRoll(성공, 전이 보류) → CONFIRM_ROLL → onSuccess", () => {
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar(), startScene: "a" }, reg);
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "roll", rng: () => 0.99 }, reg);
    if (state.phase !== "playing") throw new Error("expected playing");
    // 즉시 전이하지 않음 — 판정 대기.
    expect(state.currentScene).toBe("a");
    expect(state.pendingRoll?.success).toBe(true);
    expect(state.pendingRoll?.target).toBe("ok");
    state = gameReducer(state, { type: "CONFIRM_ROLL" }, reg);
    if (state.phase !== "playing") throw new Error("expected playing");
    expect(state.currentScene).toBe("ok");
    expect(state.pendingRoll).toBeUndefined();
  });

  it("RNG 0 → pendingRoll(실패) → CONFIRM_ROLL → onFailure", () => {
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar(), startScene: "a" }, reg);
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "roll", rng: () => 0 }, reg);
    if (state.phase !== "playing") throw new Error("expected playing");
    expect(state.currentScene).toBe("a");
    expect(state.pendingRoll?.success).toBe(false);
    state = gameReducer(state, { type: "CONFIRM_ROLL" }, reg);
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

  it("pendingRoll(실패) → REROLL(성공) → 결과 갱신 + rerollsLeft -1 → CONFIRM → onSuccess", () => {
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar({ rerollsLeft: 2 }), startScene: "a" }, reg);
    // 실패 (RNG 0) — pendingRoll, 전이 보류.
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "roll", rng: () => 0 }, reg);
    if (state.phase !== "playing") throw new Error("expected playing");
    expect(state.pendingRoll?.success).toBe(false);
    expect(state.currentScene).toBe("a");
    // REROLL — RNG 0.99 (roll 20) 성공 → pendingRoll 갱신, rerollsLeft -1, 아직 전이 X.
    state = gameReducer(state, { type: "REROLL", rng: () => 0.99 }, reg);
    if (state.phase !== "playing") throw new Error("expected playing");
    expect(state.pendingRoll?.success).toBe(true);
    expect(state.character.rerollsLeft).toBe(1);
    expect(state.currentScene).toBe("a");
    // 확정 → 비로소 전이.
    state = gameReducer(state, { type: "CONFIRM_ROLL" }, reg);
    if (state.phase !== "playing") throw new Error("expected playing");
    expect(state.currentScene).toBe("ok");
  });

  it("rerollsLeft 0 → REROLL 무시 (state 무변화)", () => {
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar({ rerollsLeft: 0 }), startScene: "a" }, reg);
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "roll", rng: () => 0 }, reg);
    const before = state;
    const after = gameReducer(state, { type: "REROLL", rng: () => 0.99 }, reg);
    expect(after).toEqual(before);
  });
});

describe("onEnter.rerollDelta", () => {
  it("진입 씬 onEnter.rerollDelta → rerollsLeft 보충", () => {
    const reg: SceneRegistry = {
      a: makeScene({ id: "a", choices: [{ kind: "plain", id: "go", label: "go", to: "b" }] }),
      b: makeScene({ id: "b", onEnter: { rerollDelta: 1 } }),
    };
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar({ rerollsLeft: 1 }), startScene: "a" }, reg);
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "go" }, reg);
    if (state.phase !== "playing") throw new Error("expected playing");
    expect(state.character.rerollsLeft).toBe(2);
  });
});

// ── #89 선택지가 남기는 흔적(setFlags) ──────────────────────────────────────
//
// 도착 씬이 같은 선택지들이 있다(골목의 동류 접촉, 갱도 안내 거래 등). 씬의 onEnter 로는
// 어느 쪽을 골랐는지 남길 수 없어 **선택이 통째로 사라졌다**. 선택지 자체에 흔적을 남긴다.
// stigmaDelta 가 이미 같은 방식으로 붙어 있어 그 패턴을 따른다.
describe("선택지 setFlags (#89)", () => {
  const scenesWith = (choice: Scene["choices"][number]): SceneRegistry => ({
    here: makeScene({ id: "here", choices: [choice] }),
    there: makeScene({ id: "there" }),
  });
  const playing = (flags: Record<string, boolean | number> = {}): GameState => ({
    phase: "playing",
    character: makeChar({ flags }),
    currentScene: "here",
    log: [],
  });

  it("plain 선택지의 flag 가 캐릭터에 남는다", () => {
    const s = gameReducer(
      playing(),
      { type: "MAKE_CHOICE", choiceId: "c" },
      scenesWith({ kind: "plain", id: "c", label: "거래에 응한다", to: "there", setFlags: { tunnelDebt: true } }),
    );
    expect(s.phase).toBe("playing");
    if (s.phase !== "playing") return;
    expect(s.character.flags.tunnelDebt).toBe(true);
    expect(s.currentScene).toBe("there");
  });

  it("conditional 선택지도 남긴다", () => {
    const s = gameReducer(
      playing({ gate: true }),
      { type: "MAKE_CHOICE", choiceId: "c" },
      scenesWith({
        kind: "conditional", id: "c", label: "조건부", to: "there",
        condition: { kind: "flag", key: "gate" },
        setFlags: { cameoAlly: true },
      }),
    );
    if (s.phase !== "playing") return;
    expect(s.character.flags.cameoAlly).toBe(true);
  });

  it("기존 flag 를 지우지 않고 얹는다", () => {
    const s = gameReducer(
      playing({ old: true }),
      { type: "MAKE_CHOICE", choiceId: "c" },
      scenesWith({ kind: "plain", id: "c", label: "x", to: "there", setFlags: { fresh: true } }),
    );
    if (s.phase !== "playing") return;
    expect(s.character.flags).toMatchObject({ old: true, fresh: true });
  });

  it("setFlags 가 없으면 flags 를 건드리지 않는다", () => {
    const before = playing({ old: true });
    const s = gameReducer(
      before,
      { type: "MAKE_CHOICE", choiceId: "c" },
      scenesWith({ kind: "plain", id: "c", label: "x", to: "there" }),
    );
    if (s.phase !== "playing") return;
    expect(s.character.flags).toEqual({ old: true });
  });
});

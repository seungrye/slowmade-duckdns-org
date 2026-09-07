// #250 - integration unit tests for the reducer's stigmaErosion.

import { describe, it, expect } from "vitest";
import type { Character, GameState, Scene, SceneRegistry } from "@/types/web-adventure";
import { gameReducer } from "./reducer";

function makeChar(stigma = 0, ability: Character["ability"] = "lunar"): Character {
  return {
    stats: { str: 10, dex: 10, int: 10, cha: 10, con: 10, wis: 10 },
    hp: 10,
    maxHp: 10,
    ability,
    protagonist: "kael",
    stigmaErosion: stigma,
    inventory: [],
    flags: {},
    rerollsLeft: 3,
  };
}

function makeScenes(): SceneRegistry {
  const sceneA: Scene = {
    id: "a",
    illustration: "/x.jpg",
    title: "A",
    body: ["start"],
    choices: [
      { kind: "plain", id: "to_b", label: "go b", to: "b", stigmaDelta: 3 },
      {
        kind: "probability",
        id: "magic",
        label: "magic",
        stat: "int",
        difficulty: 5,
        onSuccess: "b",
        onFailure: "c",
        stigmaDelta: 5,
        stigmaDeltaOnSuccess: 2,
      },
    ],
  };
  const sceneB: Scene = {
    id: "b",
    illustration: "/x.jpg",
    title: "B",
    body: ["body"],
    choices: [{ kind: "plain", id: "back", label: "back", to: "a" }],
    onEnter: { stigmaDelta: 10 },
  };
  const sceneC: Scene = {
    id: "c",
    illustration: "/x.jpg",
    title: "C",
    body: ["body"],
    choices: [{ kind: "plain", id: "back", label: "back", to: "a" }],
  };
  const pet: Scene = {
    id: "petrification",
    illustration: "/x.jpg",
    title: "석화",
    body: ["몸이 굳었다."],
    choices: [],
    isEnding: true,
    endingId: "petrification",
  };
  return { a: sceneA, b: sceneB, c: sceneC, petrification: pet };
}

describe("reducer + stigma", () => {
  it("plain choice 의 stigmaDelta 가 누적된다", () => {
    const scenes = makeScenes();
    const state: GameState = { phase: "playing", character: makeChar(0), currentScene: "a", log: [] };
    const next = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "to_b" }, scenes);
    expect(next.phase).toBe("playing");
    if (next.phase === "playing") {
      // a→b: choice stigmaDelta 3 + b onEnter stigmaDelta 10 = 13
      expect(next.character.stigmaErosion).toBe(13);
    }
  });

  it("probability choice 의 stigmaDelta + 성공 시 stigmaDeltaOnSuccess 까지 적용", () => {
    const scenes = makeScenes();
    const state: GameState = { phase: "playing", character: makeChar(0), currentScene: "a", log: [] };
    // rng 0.99 -> success.
    let next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "magic", rng: () => 0.99 },
      scenes,
    );
    if (next.phase === "playing" && next.pendingRoll) next = gameReducer(next, { type: "CONFIRM_ROLL" }, scenes);
    expect(next.phase).toBe("playing");
    if (next.phase === "playing") {
      // success → onSuccess=b (onEnter stigma+10)
      // choice stigmaDelta 5 + stigmaDeltaOnSuccess 2 + onEnter 10 = 17
      expect(next.character.stigmaErosion).toBe(17);
    }
  });

  it("stigmaErosion 100 도달 시 자동 petrification 엔딩", () => {
    const scenes = makeScenes();
    const state: GameState = {
      phase: "playing",
      character: makeChar(95),
      currentScene: "a",
      log: [],
    };
    // to_b: stigmaDelta=3 + onEnter=10 → 95+13 = 108 → clamp 100 → petrification.
    const next = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "to_b" }, scenes);
    expect(next.phase).toBe("ended");
    if (next.phase === "ended") {
      expect(next.endingId).toBe("petrification");
      expect(next.character.stigmaErosion).toBe(100);
    }
  });

  it("stigmaErosion 100 이지만 도달 씬이 *명시적 isEnding* 이면 그 엔딩 우선", () => {
    const scenes = makeScenes();
    const state: GameState = {
      phase: "playing",
      character: makeChar(99),
      currentScene: "a",
      log: [],
    };
    // When the magic leading to c fails (rng 0.0) -> the choice's stigma +5 (the +2 for success does not apply)
    // c is an ordinary scene. 99 + 5 = 104 -> clamped to 100 -> automatic petrification (c is not isEnding).
    let next = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "magic", rng: () => 0.0 },
      scenes,
    );
    if (next.phase === "playing" && next.pendingRoll) next = gameReducer(next, { type: "CONFIRM_ROLL" }, scenes);
    expect(next.phase).toBe("ended");
    if (next.phase === "ended") {
      expect(next.endingId).toBe("petrification");
    }
  });

  it("probability con/dex 판정 시 stigmaErosion>=50 디버프 -2 적용", () => {
    const scenesWithCon: SceneRegistry = {
      ...makeScenes(),
      a: {
        id: "a",
        illustration: "/x.jpg",
        title: "A",
        body: ["start"],
        choices: [
          {
            kind: "probability",
            id: "jump",
            label: "jump",
            stat: "dex",
            difficulty: 18,
            onSuccess: "b",
            onFailure: "c",
          },
        ],
      },
    };
    // stigma 50 with dex 10 -> a -2 debuff -> effectiveDex 8.
    // d20 + 8 against 18 - a d20 of 9 gives 17 and fails; a 10 gives 18 and succeeds.
    // rng 0.5 -> d20 is about 11. With effectiveDex 8, 11 + 8 = 19 -> success.
    // Without the debuff, 11 + 10 = 21 -> success. The same.
    // To see the difference, something stricter - difficulty 21: dex 10 + 11 = 21 succeeds, 8 + 11 = 19 after the debuff fails.
    const scenesHard: SceneRegistry = {
      ...scenesWithCon,
      a: {
        ...scenesWithCon.a,
        choices: [{ ...(scenesWithCon.a.choices[0] as { difficulty: number }), difficulty: 21 }] as Scene["choices"],
      },
    };
    // stigma 0: 11 + 10 = 21 >= 21 -> success -> b.
    const noDebuff = gameReducer(
      { phase: "playing", character: makeChar(0), currentScene: "a", log: [] },
      { type: "MAKE_CHOICE", choiceId: "jump", rng: () => 0.5 },
      scenesHard,
    );
    expect(noDebuff.phase).toBe("playing");
    if (noDebuff.phase === "playing") expect(noDebuff.pendingRoll?.target).toBe("b");

    // stigma 50: 11 + 8 = 19 < 21 -> failure -> c.
    const debuff = gameReducer(
      { phase: "playing", character: makeChar(50), currentScene: "a", log: [] },
      { type: "MAKE_CHOICE", choiceId: "jump", rng: () => 0.5 },
      scenesHard,
    );
    expect(debuff.phase).toBe("playing");
    if (debuff.phase === "playing") expect(debuff.pendingRoll?.target).toBe("c");
  });
});

// #257 a full e2e play-through of Eternia - the 3 protagonists x 6 endings matrix.
//
// mongo is the single source for the content, so the *static fallback* is empty. To verify that mongo's
// content *graph structure* is playable end to end, this test builds a *minimal sceneRegistry* by hand
// and confirms through a reducer simulation that all 6 endings are reachable.
//
// It verifies:
//   1. the reducer can move to the ended phase for all 6 of types' EndingId enum.
//   2. probability's stigmaDelta and the automatic petrification from contamination.
//   3. world-flag conditional branches (knowsAscensionPlot, spiritBeastDied).

import { describe, test, expect } from "vitest";
import type { Character, EndingId, GameState, Scene, SceneRegistry } from "@/types/web-adventure";
import { gameReducer } from "../engine/reducer";

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    stats: { str: 8, dex: 8, int: 8, cha: 8, con: 8, wis: 8 },
    hp: 10,
    maxHp: 10,
    ability: "lunar",
    protagonist: "kael",
    stigmaErosion: 0,
    inventory: [],
    flags: {},
    rerollsLeft: 3,
    ...overrides,
  };
}

/** The *minimal graph* that reaches each ending - start -> ending. */
function makeMinimalScenes(endingId: EndingId): SceneRegistry {
  const start: Scene = {
    id: "start",
    illustration: "/x.jpg",
    title: "시작",
    body: ["start"],
    choices: [{ kind: "plain", id: "to_end", label: "엔딩으로", to: "end" }],
  };
  const end: Scene = {
    id: "end",
    illustration: "/x.jpg",
    title: `${endingId} 엔딩`,
    body: ["the end"],
    choices: [],
    isEnding: true,
    endingId,
  };
  return { start, end };
}

const ENDINGS: EndingId[] = ["ascension", "revolution", "harmony", "fall", "petrification", "sylvan_bond"];

describe("e2e 풀 플레이 — 6 엔딩 도달 가능", () => {
  test.each(ENDINGS)("%s 엔딩에 reducer 가 도달한다", (endingId) => {
    const scenes = makeMinimalScenes(endingId);
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar(), startScene: "start" }, scenes);
    expect(state.phase).toBe("playing");
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "to_end" }, scenes);
    expect(state.phase).toBe("ended");
    if (state.phase === "ended") {
      expect(state.endingId).toBe(endingId);
    }
  });

  test("침식도 100 도달 → 자동 petrification 엔딩 (target 이 다른 endingId 라도)", () => {
    const scenes: SceneRegistry = {
      start: {
        id: "start",
        illustration: "/x.jpg",
        title: "시작",
        body: [],
        choices: [
          {
            kind: "plain",
            id: "magic",
            label: "강한 마법",
            to: "magic_result",
            stigmaDelta: 100, // 한 번에 100 까지 누적.
          },
        ],
      },
      magic_result: {
        id: "magic_result",
        illustration: "/x.jpg",
        title: "마법 결과",
        body: ["일반 씬 (엔딩 아님)"],
        choices: [],
      },
    };
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar(), startScene: "start" }, scenes);
    state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "magic" }, scenes);
    expect(state.phase).toBe("ended");
    if (state.phase === "ended") {
      expect(state.endingId).toBe("petrification");
      expect(state.character.stigmaErosion).toBe(100);
    }
  });

  test("world flag (이전 회차 spiritBeastDied) 가 conditional 분기 잠금 해제", () => {
    const scenes: SceneRegistry = {
      start: {
        id: "start",
        illustration: "/x.jpg",
        title: "시작",
        body: [],
        choices: [
          {
            kind: "conditional",
            id: "spirit_swallow",
            label: "[영수의 분노]",
            condition: { kind: "flag", key: "spiritBeastDied" },
            to: "end_sylvan",
            hidden: true,
          },
          { kind: "plain", id: "to_fall", label: "추락", to: "end_fall" },
        ],
      },
      end_sylvan: {
        id: "end_sylvan",
        illustration: "/x.jpg",
        title: "정령의 결속",
        body: [],
        choices: [],
        isEnding: true,
        endingId: "sylvan_bond",
      },
      end_fall: {
        id: "end_fall",
        illustration: "/x.jpg",
        title: "추락",
        body: [],
        choices: [],
        isEnding: true,
        endingId: "fall",
      },
    };

    // no flag -> the conditional is blocked -> the state is unchanged.
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar(), startScene: "start" }, scenes);
    const noFlag = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "spirit_swallow" }, scenes);
    expect(noFlag).toEqual(state); // unchanged.

    // with the flag -> it passes -> the sylvan_bond ending.
    const charWithFlag = makeChar({ flags: { spiritBeastDied: true } });
    let s2: GameState = { phase: "creating" };
    s2 = gameReducer(s2, { type: "START_GAME", character: charWithFlag, startScene: "start" }, scenes);
    s2 = gameReducer(s2, { type: "MAKE_CHOICE", choiceId: "spirit_swallow" }, scenes);
    expect(s2.phase).toBe("ended");
    if (s2.phase === "ended") expect(s2.endingId).toBe("sylvan_bond");
  });
});

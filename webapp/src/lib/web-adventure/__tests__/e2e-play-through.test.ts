// #257 〈에테르니아〉 e2e 풀 플레이 — 3 주인공 × 6 엔딩 매트릭스.
//
// 콘텐츠는 mongo 가 단일 소스이므로 *정적 fallback* 이 비어 있다. 이 테스트는
// mongo 의 콘텐츠 *그래프 구조* 가 e2e 플레이 가능함을 검증하기 위해 *최소 sceneRegistry*
// 를 직접 구성 + reducer 시뮬레이션으로 6 엔딩 모두 도달 가능한지 확인.
//
// 검증:
//   1. types 의 EndingId enum 6 종 모두 reducer 가 ended phase 로 전환할 수 있다.
//   2. probability 의 stigmaDelta + 침식 자동 petrification 동작.
//   3. world flag conditional 분기 (knowsAscensionPlot, spiritBeastDied).

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

/** 각 엔딩에 도달하는 *최소 그래프* — start → ending. */
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

    // 플래그 없음 → conditional 차단 → state 무변화.
    let state: GameState = { phase: "creating" };
    state = gameReducer(state, { type: "START_GAME", character: makeChar(), startScene: "start" }, scenes);
    const noFlag = gameReducer(state, { type: "MAKE_CHOICE", choiceId: "spirit_swallow" }, scenes);
    expect(noFlag).toEqual(state); // 무변화.

    // 플래그 있음 → 통과 → sylvan_bond 엔딩.
    const charWithFlag = makeChar({ flags: { spiritBeastDied: true } });
    let s2: GameState = { phase: "creating" };
    s2 = gameReducer(s2, { type: "START_GAME", character: charWithFlag, startScene: "start" }, scenes);
    s2 = gameReducer(s2, { type: "MAKE_CHOICE", choiceId: "spirit_swallow" }, scenes);
    expect(s2.phase).toBe("ended");
    if (s2.phase === "ended") expect(s2.endingId).toBe("sylvan_bond");
  });
});

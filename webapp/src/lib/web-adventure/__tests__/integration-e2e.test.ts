// #269 통합 e2e — 실제 mongo content 그래프 + reducer 로 6 엔딩 모두 완주.
//
// 기존 e2e-play-through 는 *최소 인공 그래프* 시뮬레이션이라 그래프 구조가 깨져도
// 통과한다. 본 테스트는 mongo 의 실제 *씬·분기·flag·minStat·probability* 가 결합된
// 상태로 *각 주인공* 시작 씬에서 *각 엔딩* 까지 도달 가능한지 검증.
//
// #353 — 기존엔 (주인공, 엔딩) 마다 choice id 시퀀스를 *하드코딩* 했는데,
// 씬을 추가/삽입할 때마다 경로가 깨졌다 (kael 추리 시퀀스 삽입이 계기).
// 이제 *동적 솔버* 로 전환: 각 (주인공, 엔딩) 타겟에 대해 그래프를 DFS 로 탐색해
// reducer 를 실제로 통과하며 그 엔딩에 도달하는 경로가 존재하는지 확인한다.
// probability 는 성공/실패 RNG 양쪽을, conditional 은 reducer 평가(무효 시 무변화)를
// 그대로 따른다. 씬 방문 횟수 제한으로 사이클(추리 허브 왕복 등) 무한루프 차단.

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import type {
  Character,
  EndingId,
  GameState,
  Protagonist,
  Scene,
  SceneRegistry,
} from "@/types/web-adventure";
import { gameReducer } from "../engine/reducer";
import { protagonists } from "@/content/web-adventure/protagonists";

// 검증할 (주인공, 엔딩) 매트릭스. petrification 은 *자동 엔딩*(침식 100)이라
// choice 경로 탐색과 성격이 달라 별도 테스트로 분리.
const TARGETS: { protagonist: Protagonist; endingId: EndingId }[] = [
  { protagonist: "kael", endingId: "revolution" },
  { protagonist: "kael", endingId: "ascension" },
  { protagonist: "kael", endingId: "harmony" },
  { protagonist: "kael", endingId: "fall" },
  { protagonist: "rin", endingId: "revolution" },
  { protagonist: "rin", endingId: "ascension" },
  { protagonist: "rin", endingId: "harmony" },
  { protagonist: "rin", endingId: "fall" },
  { protagonist: "solwen", endingId: "revolution" },
  { protagonist: "solwen", endingId: "harmony" },
  { protagonist: "solwen", endingId: "fall" },
  { protagonist: "solwen", endingId: "sylvan_bond" },
];

const RNG_SUCCESS = () => 0.99; // roll = 20 (probability 성공).
const RNG_FAIL = () => 0.0; //    roll = 1  (probability 실패).

function startState(protagonist: Protagonist, scenes: SceneRegistry): GameState {
  const meta = protagonists[protagonist];
  const con = meta.baseStats.con;
  const character: Character = {
    stats: meta.baseStats,
    hp: 10 + con * 2,
    maxHp: 10 + con * 2,
    ability: "lunar", // 테스트 단순화 — 모든 시나리오 lunar (int 보너스).
    protagonist,
    stigmaErosion: meta.startStigma,
    inventory: [...meta.startInventory],
    flags: {},
    rerollsLeft: 0,
  };
  let state: GameState = { phase: "creating" };
  state = gameReducer(
    state,
    { type: "START_GAME", character, startScene: meta.startScene },
    scenes,
  );
  return state;
}

// 동적 솔버 — 시작 상태에서 DFS 로 targetEnding 에 도달하는 경로를 탐색.
//   - probability choice: 성공/실패 RNG 양쪽을 자식으로 전개.
//   - plain/conditional: reducer 평가. 조건 미충족 등으로 *씬이 안 바뀌면* 무효로 스킵.
//   - 씬 방문 횟수 제한(MAX_VISITS): 추리 허브 왕복 등 사이클의 무한루프 차단.
// 도달하면 그 ended GameState 를, 못 찾으면 null 을 반환.
const MAX_DEPTH = 80;
const MAX_VISITS = 4;

function solve(
  scenes: SceneRegistry,
  protagonist: Protagonist,
  targetEnding: EndingId,
): GameState | null {
  const start = startState(protagonist, scenes);

  function dfs(
    state: GameState,
    depth: number,
    visits: Map<string, number>,
  ): GameState | null {
    if (state.phase === "ended") {
      return state.endingId === targetEnding ? state : null;
    }
    if (state.phase !== "playing" || depth > MAX_DEPTH) return null;

    const scene = scenes[state.currentScene];
    if (!scene) return null;

    const seen = visits.get(state.currentScene) ?? 0;
    if (seen > MAX_VISITS) return null;
    const nextVisits = new Map(visits);
    nextVisits.set(state.currentScene, seen + 1);

    for (const choice of scene.choices ?? []) {
      const rngs =
        choice.kind === "probability" ? [RNG_SUCCESS, RNG_FAIL] : [RNG_SUCCESS];
      for (const rng of rngs) {
        const next = gameReducer(
          state,
          { type: "MAKE_CHOICE", choiceId: choice.id, rng },
          scenes,
        );
        // 무효(조건 미충족 등) → 같은 씬에 머무름 → 스킵. probability 는 항상 전이.
        if (
          choice.kind !== "probability" &&
          next.phase === "playing" &&
          next.currentScene === state.currentScene
        ) {
          continue;
        }
        const res = dfs(next, depth + 1, nextVisits);
        if (res) return res;
      }
    }
    return null;
  }

  return dfs(start, 0, new Map());
}

let loaded: SceneRegistry | null = null;

beforeAll(async () => {
  if (!process.env.MONGO_URI) return;
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    "IntegrationE2E",
    new mongoose.Schema({}, { strict: false, collection: "webadventurescenes" }),
  );
  const all = (await Scene.find({}).lean()) as unknown as Scene[];
  const registry: SceneRegistry = {};
  for (const s of all) {
    registry[s.id] = s;
  }
  loaded = registry;
  await mongoose.disconnect();
});

afterAll(async () => {
  loaded = null;
});

describe("통합 e2e — 실제 mongo 그래프 완주 (#269)", () => {
  test.each(TARGETS)(
    "$protagonist → $endingId (동적 탐색)",
    ({ protagonist, endingId }) => {
      if (!loaded) {
        console.warn("MONGO_URI 없음 — skip");
        return;
      }
      const final = solve(loaded, protagonist, endingId);
      expect(
        final,
        `${protagonist} → ${endingId} 도달 경로를 찾지 못함`,
      ).not.toBeNull();
      if (final && final.phase === "ended") {
        expect(final.endingId).toBe(endingId);
      }
    },
  );

  test("Kael — 시작 침식 80 에 마력석 파편 4 사용 → 자동 petrification", () => {
    if (!loaded) return;
    // 인공 시나리오: Kael 시작 시 파편 4 개 인벤 보유. USE 4 회 누적 → 100 → 자동 ending.
    const meta = protagonists.kael;
    const character: Character = {
      stats: meta.baseStats,
      hp: 10 + meta.baseStats.con * 2,
      maxHp: 10 + meta.baseStats.con * 2,
      ability: "lunar", // 테스트 단순화 — 모든 시나리오 lunar (int 보너스).
      protagonist: "kael",
      stigmaErosion: meta.startStigma, // 80
      inventory: ["mana_stone_fragment", "mana_stone_fragment", "mana_stone_fragment", "mana_stone_fragment"],
      flags: {},
      rerollsLeft: 0,
    };
    let state: GameState = { phase: "creating" };
    state = gameReducer(
      state,
      { type: "START_GAME", character, startScene: meta.startScene },
      loaded,
    );
    for (let i = 0; i < 4; i++) {
      state = gameReducer(state, { type: "USE_ITEM", itemId: "mana_stone_fragment" }, loaded);
      if (state.phase === "ended") break;
    }
    expect(state.phase).toBe("ended");
    if (state.phase === "ended") {
      expect(state.endingId).toBe("petrification");
      expect(state.character.stigmaErosion).toBe(100);
    }
  });
});

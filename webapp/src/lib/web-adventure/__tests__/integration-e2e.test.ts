// #269 integration e2e - completing all 6 endings with the real mongo content graph plus the reducer.
//
// The existing e2e-play-through simulates a *minimal artificial graph*, so it passes even when the graph structure
// is broken. This test verifies that with mongo's real *scenes, branches, flags, minStats and probabilities* all in
// play, *each ending* is reachable from *each protagonist's* starting scene.
//
// #353 - the choice-id sequence used to be *hard-coded* per (protagonist, ending), and every added or inserted
// scene broke the paths (inserting Kael's deduction sequence was what prompted this).
// It is now *a dynamic solver*: for each (protagonist, ending) target it searches the graph with DFS and confirms
// a path exists that reaches that ending while actually passing through the reducer.
// probability follows both the success and failure RNG, and conditional follows the reducer's evaluation (no change
// when invalid). A per-scene visit cap blocks infinite loops on cycles (looping through the deduction hub and so on).

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

// The (protagonist, ending) matrix to verify. petrification is *an automatic ending* (contamination 100) and
// differs in character from a choice-path search, so it is split into its own test.
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
  // #356 - the Omphalos neo-elf alliance (ally_sylvan) lets non-Solwen reach sylvan_bond too (non-linear).
  { protagonist: "kael", endingId: "sylvan_bond" },
  { protagonist: "rin", endingId: "sylvan_bond" },
  // #359 - an ending exclusive to Kael's awakening route (an independent story bypassing the Omphalos).
  { protagonist: "kael", endingId: "liberation" },
  { protagonist: "kael", endingId: "usurpation" },
  // #361 — 린 각성 엔딩(liberation/regency/purge/wayfarer)은 분기가 옴팔로스 직전이라
  //   동적 솔버가 거대 그래프 DFS 에 시간을 소진한다. 명시 경로 테스트로 따로 검증(아래).
];

const RNG_SUCCESS = () => 0.99; // roll = 20 (the probability succeeds).
const RNG_FAIL = () => 0.0; //    roll = 1  (the probability fails).

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

// The dynamic solver - a DFS from the starting state for a path that reaches targetEnding.
//   - a probability choice: both the success and failure RNG are expanded as children.
//   - plain/conditional: the reducer's evaluation. If *the scene does not change* (an unmet condition and so on) it is skipped as invalid.
//   - a per-scene visit cap (MAX_VISITS): blocks infinite loops on cycles such as looping through the deduction hub.
// On reaching it, the ended GameState is returned; otherwise null.
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
        let next = gameReducer(
          state,
          { type: "MAKE_CHOICE", choiceId: choice.id, rng },
          scenes,
        );
        // probability does not transition at once - it goes through pendingRoll and is confirmed by CONFIRM_ROLL.
        if (next.phase === "playing" && next.pendingRoll) {
          next = gameReducer(next, { type: "CONFIRM_ROLL" }, scenes);
        }
        // Invalid (an unmet condition and so on) -> it stays in the same scene -> skipped. probability always transitions.
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
    // An artificial scenario: Kael starts holding 4 shards. USE four times accumulates -> 100 -> the automatic ending.
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

  // #361 - the explicit path for Rin's awakening route (conviction and corruption). The branch sits just before the
  //   Omphalos, so a DFS over the huge graph would burn time - the run is verified directly by a choiceId sequence.
  test("rin 각성 루트 명시 경로 → liberation/regency/purge/wayfarer (#361)", () => {
    if (!loaded) return;
    const meta = protagonists.rin;
    const con = meta.baseStats.con;
    const baseChar = (): Character => ({
      stats: meta.baseStats, hp: 10 + con * 2, maxHp: 10 + con * 2,
      ability: "lunar", protagonist: "rin",
      stigmaErosion: meta.startStigma, inventory: [...meta.startInventory], flags: {}, rerollsLeft: 3,
    });
    // Forced to start from rin_underground (the earlier main path is covered by the existing TARGETS). Only failAt's probability fails.
    function run(choices: string[], failAt?: string): GameState {
      let state: GameState = { phase: "playing", character: baseChar(), currentScene: "rin_underground", log: [] };
      for (const c of choices) {
        if (state.phase !== "playing") break;
        const rng = c === failAt ? RNG_FAIL : RNG_SUCCESS;
        state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: c, rng }, loaded!);
        if (state.phase === "playing" && state.pendingRoll) state = gameReducer(state, { type: "CONFIRM_ROLL" }, loaded!);
      }
      return state;
    }
    const cases: { ending: EndingId; path: string[]; failAt?: string }[] = [
      { ending: "liberation", path: ["pursue_vale", "follow_trail", "approach_slow", "keep_faith", "embrace_pyre", "seize_awakening", "cast_the_truth"] },
      { ending: "regency", path: ["pursue_vale", "follow_trail", "approach_slow", "take_deal", "to_throne", "secure_power"] },
      { ending: "purge", path: ["pursue_vale", "follow_trail", "approach_slow", "take_deal", "to_throne", "secure_power"], failAt: "secure_power" },
      { ending: "wayfarer", path: ["pursue_vale", "follow_trail", "approach_slow", "keep_faith", "embrace_pyre", "turn_back", "walk_away"] },
    ];
    for (const { ending, path, failAt } of cases) {
      const final = run(path, failAt);
      expect(final.phase, `rin → ${ending}`).toBe("ended");
      if (final.phase === "ended") expect(final.endingId).toBe(ending);
    }
  });
});

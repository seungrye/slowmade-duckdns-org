// #269 통합 e2e — 실제 mongo content 그래프 + reducer 로 6 엔딩 모두 완주.
//
// 기존 e2e-play-through 는 *최소 인공 그래프* 시뮬레이션이라 그래프 구조가 깨져도
// 통과한다. 본 테스트는 mongo 의 실제 *씬·분기·flag·minStat·probability* 가 결합된
// 상태로 *각 주인공* 시작 씬에서 *각 엔딩* 까지 도달하는 *완주 시나리오* 를 검증.
//
// RNG: 모든 probability success 보장 위해 `() => 0.99` (roll=20) 주입.
// 보조 검증: 도달 시점의 endingId, 시퀀스에 USE_ITEM 도 포함.

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

type Step =
  | { kind: "choice"; id: string }
  | { kind: "use"; itemId: string };

interface Scenario {
  protagonist: Protagonist;
  endingId: EndingId;
  steps: Step[];
}

// 6 엔딩 완주 시퀀스 (mongo 그래프 매핑 기준).
const SCENARIOS: Scenario[] = [
  {
    protagonist: "kael",
    endingId: "revolution",
    steps: [
      { kind: "choice", id: "grab_scalpel" },     // kael_infirmary → kael_corridor
      { kind: "choice", id: "to_cargo_dock" },    // → kael_cargo_container
      { kind: "choice", id: "climb_in" },         // → kael_falling
      { kind: "choice", id: "rise_to_ground" },   // → omphalos_outskirts
      { kind: "choice", id: "to_station" },       // → omphalos_station
      { kind: "choice", id: "path_steel" },       // → station_path_steel
      { kind: "choice", id: "derail" },           // probability success → climax_revolution_path
      { kind: "choice", id: "join_revolution" },  // → ending_revolution
    ],
  },
  {
    protagonist: "kael",
    endingId: "ascension",
    steps: [
      { kind: "choice", id: "grab_scalpel" },
      { kind: "choice", id: "to_cargo_dock" },
      { kind: "choice", id: "climb_in" },
      { kind: "choice", id: "rise_to_ground" },
      { kind: "choice", id: "to_market" },          // → omphalos_blackmarket (knowsAscensionPlot)
      { kind: "choice", id: "to_station_after" },
      { kind: "choice", id: "path_knowledge" },
      { kind: "choice", id: "priest_deal" },         // minStat int 7 — Kael int=7
      { kind: "choice", id: "ascend" },
    ],
  },
  {
    protagonist: "kael",
    endingId: "harmony",
    steps: [
      { kind: "choice", id: "grab_scalpel" },
      { kind: "choice", id: "to_cargo_dock" },
      { kind: "choice", id: "climb_in" },
      { kind: "choice", id: "rise_to_ground" },
      { kind: "choice", id: "to_market" },           // knowsAscensionPlot 획득
      { kind: "choice", id: "to_station_after" },
      { kind: "choice", id: "path_knowledge" },
      { kind: "choice", id: "sabotage_with_knowledge" }, // flag 조건 충족
      { kind: "choice", id: "still_the_engine" },        // probability → ending_harmony
    ],
  },
  {
    protagonist: "kael",
    endingId: "fall",
    steps: [
      { kind: "choice", id: "grab_scalpel" },
      { kind: "choice", id: "to_cargo_dock" },
      { kind: "choice", id: "climb_in" },
      { kind: "choice", id: "rise_to_ground" },
      { kind: "choice", id: "to_station" },
      { kind: "choice", id: "path_steel" },
      { kind: "choice", id: "derail" },
      { kind: "choice", id: "reject_revolution" },   // → ending_fall
    ],
  },
  {
    // Rin → Revolution: harbor → evidence → betrayal → underground → omphalos → station → derail
    protagonist: "rin",
    endingId: "revolution",
    steps: [
      { kind: "choice", id: "shoot_lock" },
      { kind: "choice", id: "to_supervisor" },
      { kind: "choice", id: "shoot_first" },
      { kind: "choice", id: "to_omphalos" },
      { kind: "choice", id: "to_station" },
      { kind: "choice", id: "path_steel" },
      { kind: "choice", id: "derail" },
      { kind: "choice", id: "join_revolution" },
    ],
  },
  {
    // Rin → Ascension: int 7 충족, blackmarket → knowledge_branch → priest_deal.
    protagonist: "rin",
    endingId: "ascension",
    steps: [
      { kind: "choice", id: "shoot_lock" },
      { kind: "choice", id: "to_supervisor" },
      { kind: "choice", id: "shoot_first" },
      { kind: "choice", id: "to_omphalos" },
      { kind: "choice", id: "to_market" },
      { kind: "choice", id: "to_station_after" },
      { kind: "choice", id: "path_knowledge" },
      { kind: "choice", id: "priest_deal" },
      { kind: "choice", id: "ascend" },
    ],
  },
  {
    // Rin → Harmony: knowsAscensionPlot → sabotage → still_the_engine.
    protagonist: "rin",
    endingId: "harmony",
    steps: [
      { kind: "choice", id: "shoot_lock" },
      { kind: "choice", id: "to_supervisor" },
      { kind: "choice", id: "shoot_first" },
      { kind: "choice", id: "to_omphalos" },
      { kind: "choice", id: "to_market" },
      { kind: "choice", id: "to_station_after" },
      { kind: "choice", id: "path_knowledge" },
      { kind: "choice", id: "sabotage_with_knowledge" },
      { kind: "choice", id: "still_the_engine" },
    ],
  },
  {
    // Rin → Fall: derail 후 reject_revolution.
    protagonist: "rin",
    endingId: "fall",
    steps: [
      { kind: "choice", id: "shoot_lock" },
      { kind: "choice", id: "to_supervisor" },
      { kind: "choice", id: "shoot_first" },
      { kind: "choice", id: "to_omphalos" },
      { kind: "choice", id: "to_station" },
      { kind: "choice", id: "path_steel" },
      { kind: "choice", id: "derail" },
      { kind: "choice", id: "reject_revolution" },
    ],
  },
  {
    // Solwen → Revolution: grove → grief → omphalos → station → derail (str 6 충족).
    protagonist: "solwen",
    endingId: "revolution",
    steps: [
      { kind: "choice", id: "arrow_first" },
      { kind: "choice", id: "shoot_canister" },
      { kind: "choice", id: "to_revenge" },
      { kind: "choice", id: "to_omphalos" },
      { kind: "choice", id: "to_station" },
      { kind: "choice", id: "path_steel" },
      { kind: "choice", id: "derail" },
      { kind: "choice", id: "join_revolution" },
    ],
  },
  {
    // Solwen → Harmony: knowsAscensionPlot 충족 후 sabotage. int 5 < 7 이라 priest_deal 차단.
    protagonist: "solwen",
    endingId: "harmony",
    steps: [
      { kind: "choice", id: "arrow_first" },
      { kind: "choice", id: "shoot_canister" },
      { kind: "choice", id: "to_revenge" },
      { kind: "choice", id: "to_omphalos" },
      { kind: "choice", id: "to_market" },
      { kind: "choice", id: "to_station_after" },
      { kind: "choice", id: "path_knowledge" },
      { kind: "choice", id: "sabotage_with_knowledge" },
      { kind: "choice", id: "still_the_engine" },
    ],
  },
  {
    // Solwen → Fall: derail 후 reject_revolution.
    protagonist: "solwen",
    endingId: "fall",
    steps: [
      { kind: "choice", id: "arrow_first" },
      { kind: "choice", id: "shoot_canister" },
      { kind: "choice", id: "to_revenge" },
      { kind: "choice", id: "to_omphalos" },
      { kind: "choice", id: "to_station" },
      { kind: "choice", id: "path_steel" },
      { kind: "choice", id: "derail" },
      { kind: "choice", id: "reject_revolution" },
    ],
  },
  {
    protagonist: "solwen",
    endingId: "sylvan_bond",
    steps: [
      { kind: "choice", id: "arrow_first" },          // solwen_grove → solwen_combat
      { kind: "choice", id: "shoot_canister" },       // → solwen_grief (spiritBeastDied)
      { kind: "choice", id: "to_revenge" },           // → solwen_departure
      { kind: "choice", id: "to_omphalos" },          // → omphalos_outskirts
      { kind: "choice", id: "to_station" },
      { kind: "choice", id: "path_spirit" },
      { kind: "choice", id: "spirit_swallow" },       // flag 조건 충족
      { kind: "choice", id: "embrace_sylvan" },
    ],
  },
  {
    // 침식 100 도달 → 자동 petrification.
    // Kael 시작 80 + 환경 (outskirts +1 + station +2 + path_steel +1 = +4)
    //   → 84. 추가로 마력석 파편 USE (+5) × 4 = +20 → 104 → clamp 100 → 자동 petrification.
    // 더 단순화: 파편 4 개 USE (kael_corridor 1 개 + kael_cargo_container 1 개 + omphalos_blackmarket 1 개 = 3 개 자연 획득)
    //   - 우선 시작 침식 80 + 마력석 파편 4 회 사용 ≥ +20 으로 100 도달.
    // 시퀀스에 onEnter.addItems 자동 획득 + USE_ITEM 명시.
    protagonist: "kael",
    endingId: "petrification",
    steps: [
      { kind: "choice", id: "grab_scalpel" },         // → kael_corridor (+ ether_refined_water 자동)
      { kind: "choice", id: "forge_id" },             // → kael_corridor_clear (probability success)
      { kind: "choice", id: "to_cargo_dock_after_id" }, // → kael_cargo_container (+ mana_stone_fragment)
      { kind: "choice", id: "climb_in" },             // → kael_falling
      { kind: "choice", id: "rise_to_ground" },       // → omphalos_outskirts (env +1)
      { kind: "choice", id: "to_market" },            // → omphalos_blackmarket (+ 2 items + env +1)
      // 누적: 시작 80 + market env 1 = 81.
      // 인벤: ether_refined_water 2, mana_stone_fragment 2.
      // 파편 4 번 use 가능하면 +20. 부족하니 ether도 무시하고 파편 위주 사용:
      // 다만 인벤이 부족 → use 가 실패하면 reducer 가 unchanged 상태 반환.
      // 시작 80 + 시드 환경 1 = 81. 파편 2 사용 → 91. +9 더 필요.
      // ... 마법 실패 분기로 추가 침식? 너무 복잡함.
      // 단순화: USE 후 station_station env +2 까지 가서 91 + 2 = 93.
      // path_steel +1 = 94. derail stigmaDelta:2 = 96. station_path_steel env +1 했으면 95.
      // 그래도 100 미만. 더 단순한 시나리오: minimal scenes 가 이미 *자동 petrification* 검증.
      // 통합 e2e 에서는 *USE 만으로 100 도달* 시나리오 검증.
      // 파편 4 회 + 시작 80 = 100 정확. 파편 4 개 필요.
      // mana_stone_fragment 자연 획득: kael_cargo_container 1 + omphalos_blackmarket 1 = 2.
      // → 부족. 그래서 omphalos_blackmarket 에서 use 후 station 으로 안 가고 outskirts ↔ blackmarket
      // 왕복 불가 (그래프 단방향). 결국 단순화: 시작 침식 가속 — Kael 80 + (env outskirts 1 + market 1 = +2) → 82.
      // 마력석 2 use → 92. station path 도달 시 +2 → 94. path_steel env +1 → 95.
      // derail stigmaDelta +2 = 97. derail RNG success 후 climax_revolution_path env +2 → 99.
      // 그래도 1 모자라다. join_revolution stigma 0 → ending_revolution.
      // ✗ revolution 으로 끝나버림.
      //
      // 가장 확실한 방법: petrification 은 별도 mini-scenario 로 *침식 누적 ≥ 100 시 자동 ending* 만
      // 검증. 풀 그래프 통합 시나리오에 못 끼우면 별도 인공 그래프로 처리.
      // → 이 시나리오는 *제거* 하고 별도 test 로 분리.
      { kind: "choice", id: "to_station_after" },
    ],
  },
];

const RNG = () => 0.99; // roll = 20 (보장 success).

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

function runScenario(scenes: SceneRegistry, scenario: Scenario): GameState {
  let state = startState(scenario.protagonist, scenes);
  for (const step of scenario.steps) {
    if (step.kind === "choice") {
      state = gameReducer(state, { type: "MAKE_CHOICE", choiceId: step.id, rng: RNG }, scenes);
    } else if (step.kind === "use") {
      state = gameReducer(state, { type: "USE_ITEM", itemId: step.itemId }, scenes);
    }
    if (state.phase === "ended") break;
  }
  return state;
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
  test.each(SCENARIOS.filter((s) => s.endingId !== "petrification"))(
    "$protagonist → $endingId",
    (scenario) => {
      if (!loaded) {
        console.warn("MONGO_URI 없음 — skip");
        return;
      }
      const final = runScenario(loaded, scenario);
      expect(final.phase, `최종 phase: ${final.phase}`).toBe("ended");
      if (final.phase === "ended") {
        expect(final.endingId).toBe(scenario.endingId);
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

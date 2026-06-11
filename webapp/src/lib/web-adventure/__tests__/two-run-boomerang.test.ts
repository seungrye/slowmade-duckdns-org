// #272 회차 부메랑 통합 e2e — 2 회차 시퀀스 시뮬레이션.
//
// 검증 흐름:
//   회차 1 — Kael → Harmony 완주 (still_the_engine 성공).
//     ending → past_runs.push({endingId:"harmony"}).
//   회차 2 — Kael (또는 Rin) 시작.
//     buildWorldFlags(past_runs) = {"world.harmony_kept": true}.
//     character.flags 에 주입.
//     climax_revolution_path 에 도달 시 hidden conditional `echo_of_harmony` 가
//     *해금* — to: climax_harmony_path.
//   결과: 회차 2 가 *회차 1 의 결과 때문에* 분기 트리가 달라진다.

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import type {
  Character,
  GameState,
  Protagonist,
  Scene,
  SceneRegistry,
  Choice,
} from "@/types/web-adventure";
import { gameReducer } from "../engine/reducer";
import { buildWorldFlags } from "../world-flags";
import { protagonists } from "@/content/web-adventure/protagonists";

const RNG = () => 0.99;

function startState(
  protagonist: Protagonist,
  scenes: SceneRegistry,
  injectedFlags: Record<string, boolean> = {},
): GameState {
  const meta = protagonists[protagonist];
  const con = meta.baseStats.con;
  const character: Character = {
    stats: meta.baseStats,
    hp: 10 + con * 2,
    maxHp: 10 + con * 2,
    ability: "lunar", // 테스트 단순화 — int 보너스 일치성 위해 lunar.
    protagonist,
    stigmaErosion: meta.startStigma,
    inventory: [...meta.startInventory],
    flags: { ...injectedFlags },
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

let loaded: SceneRegistry | null = null;

beforeAll(async () => {
  if (!process.env.MONGO_URI) return;
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    "BoomerangE2E",
    new mongoose.Schema({}, { strict: false, collection: "webadventurescenes" }),
  );
  const all = (await Scene.find({}).lean()) as unknown as Scene[];
  const r: SceneRegistry = {};
  for (const s of all) r[s.id] = s;
  loaded = r;
  await mongoose.disconnect();
});

afterAll(() => {
  loaded = null;
});

describe("회차 부메랑 통합 e2e (#272)", () => {
  test("회차 1 Harmony → 회차 2 에서 echo_of_harmony hidden 분기 해금", () => {
    if (!loaded) return;
    // 1) 회차 1 — Kael → Harmony 완주.
    const r1Steps: string[] = [
      "grab_scalpel",
      "continue",        // #345 — kael_corridor_blade → kael_corridor.
      "to_cargo_dock",
      "climb_in",
      "rise_to_ground",
      "leave_wreckage",  // #353 — kael_wreckage_hub → kael_truth_gate.
      "leave_uncertain", // #353 — kael_truth_gate → omphalos_outskirts (단서 스킵).
      "to_market",
      "to_station_after",
      "path_knowledge",
      "sabotage_with_knowledge",
      "still_the_engine",
    ];
    let s1 = startState("kael", loaded);
    for (const id of r1Steps) {
      s1 = gameReducer(s1, { type: "MAKE_CHOICE", choiceId: id, rng: RNG }, loaded);
      if (s1.phase === "playing" && s1.pendingRoll) s1 = gameReducer(s1, { type: "CONFIRM_ROLL" }, loaded);
      if (s1.phase === "ended") break;
    }
    expect(s1.phase).toBe("ended");
    if (s1.phase !== "ended") return;
    expect(s1.endingId).toBe("harmony");

    // 2) past_runs → world flags.
    const pastRuns = [{ endingId: s1.endingId }];
    const flags = buildWorldFlags(pastRuns);
    expect(flags).toEqual({ "world.harmony_kept": true });

    // 3) 회차 2 — Kael 새 시작 + flags 주입.
    //    climax_revolution_path 에 도달 후, 해금된 echo_of_harmony 선택해서
    //    climax_harmony_path → ending_harmony 도달.
    const r2Steps: string[] = [
      "grab_scalpel",
      "continue",        // #345 — kael_corridor_blade → kael_corridor.
      "to_cargo_dock",
      "climb_in",
      "rise_to_ground",
      "leave_wreckage",  // #353 — kael_wreckage_hub → kael_truth_gate.
      "leave_uncertain", // #353 — kael_truth_gate → omphalos_outskirts (단서 스킵).
      "to_station",
      "sneak_in",        // #349 — omphalos_infiltration probability success → omphalos_station.
      "path_steel",
      "derail",
      "continue",        // #345 — climax_revolution_path_derail → climax_revolution_path.
      "echo_of_harmony", // hidden 해금 (world.harmony_kept) → climax_harmony_path.
      "still_the_engine",
    ];
    let s2 = startState("kael", loaded, flags);
    for (const id of r2Steps) {
      s2 = gameReducer(s2, { type: "MAKE_CHOICE", choiceId: id, rng: RNG }, loaded);
      if (s2.phase === "playing" && s2.pendingRoll) s2 = gameReducer(s2, { type: "CONFIRM_ROLL" }, loaded);
      if (s2.phase === "ended") break;
    }
    expect(s2.phase).toBe("ended");
    if (s2.phase === "ended") {
      expect(s2.endingId).toBe("harmony");
      // 회차 2 의 character flags 에 회차 1 의 부메랑이 남아있다.
      expect(s2.character.flags["world.harmony_kept"]).toBe(true);
    }
  });

  test("회차 1 Harmony 부재 → 회차 2 에서 echo_of_harmony 분기 미해금", () => {
    if (!loaded) return;
    // flags 미주입 → climax_revolution_path 에서 echo_of_harmony 선택해도 무변화.
    let s = startState("kael", loaded, {}); // 빈 flags.
    const path: string[] = [
      "grab_scalpel",
      "continue",        // #345 — kael_corridor_blade → kael_corridor.
      "to_cargo_dock",
      "climb_in",
      "rise_to_ground",
      "leave_wreckage",  // #353 — kael_wreckage_hub → kael_truth_gate.
      "leave_uncertain", // #353 — kael_truth_gate → omphalos_outskirts (단서 스킵).
      "to_station",
      "sneak_in",        // #349 — omphalos_infiltration probability success → omphalos_station.
      "path_steel",
      "derail",
      "continue",        // #345 — climax_revolution_path_derail → climax_revolution_path.
    ];
    for (const id of path) {
      s = gameReducer(s, { type: "MAKE_CHOICE", choiceId: id, rng: RNG }, loaded);
      if (s.phase === "playing" && s.pendingRoll) s = gameReducer(s, { type: "CONFIRM_ROLL" }, loaded);
    }
    // 현재 climax_revolution_path. echo_of_harmony 시도 → 분기 차단.
    const before = s;
    const tried = gameReducer(s, { type: "MAKE_CHOICE", choiceId: "echo_of_harmony", rng: RNG }, loaded);
    expect(tried).toEqual(before); // 무변화 — conditional flag 차단.

    // 대신 join_revolution → ending_revolution 으로 정상 진행.
    const next = gameReducer(s, { type: "MAKE_CHOICE", choiceId: "join_revolution", rng: RNG }, loaded);
    expect(next.phase).toBe("ended");
    if (next.phase === "ended") expect(next.endingId).toBe("revolution");
  });

  test("hidden conditional 가 sceneRegistry 에 실제로 존재 + key 가 world.harmony_kept", () => {
    if (!loaded) return;
    const cr = loaded["climax_revolution_path"];
    expect(cr).toBeTruthy();
    const echo = cr.choices.find((c: Choice) => c.id === "echo_of_harmony");
    expect(echo).toBeTruthy();
    if (!echo || echo.kind !== "conditional") throw new Error("echo_of_harmony conditional 아님");
    expect(echo.condition).toEqual({ kind: "flag", key: "world.harmony_kept" });
    expect(echo.hidden).toBe(true);
  });
});

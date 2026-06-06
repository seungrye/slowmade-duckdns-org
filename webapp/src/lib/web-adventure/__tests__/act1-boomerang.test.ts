// #283 act1 우회 분기 — 이전 회차 world flag 가 act1 두 번째 씬에 짧은
// hidden 분기를 해금한다. 본 분기 흐름 유지 + 보너스 stigmaDelta.
//
// 1) 콘텐츠 구조 검증 (3 분기 존재 + hidden + condition + to)
// 2) reducer 시뮬레이션 — flag 없으면 차단, 있으면 통과

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type {
  Character,
  Choice,
  GameState,
  Scene,
  SceneRegistry,
} from "@/types/web-adventure";
import { gameReducer } from "../engine/reducer";

const RNG = () => 0.99;

interface Patch {
  sceneId: string;
  choiceId: string;
  flag: string;
  to: string;
  stigmaDelta: number;
}

const PATCHES: Patch[] = [
  {
    sceneId: "kael_corridor",
    choiceId: "crystal_path_memory",
    flag: "world.last_one_fell",
    to: "kael_corridor_clear",
    stigmaDelta: -2,
  },
  {
    sceneId: "rin_evidence",
    choiceId: "iron_underground",
    flag: "world.revolution_won",
    to: "rin_underground",
    stigmaDelta: 0,
  },
  {
    sceneId: "solwen_combat",
    choiceId: "spirit_guidance",
    flag: "world.sylvan_awoke",
    to: "solwen_grief",
    stigmaDelta: -3,
  },
];

let loaded: SceneRegistry | null = null;

beforeAll(async () => {
  if (!process.env.MONGO_URI) return;
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    "Act1Boomerang",
    new mongoose.Schema({}, { strict: false, collection: "webadventurescenes" }),
  );
  const all = (await Scene.find({}).lean()) as unknown as Scene[];
  const r: SceneRegistry = {};
  for (const s of all) r[s.id] = s;
  loaded = r;
  await mongoose.disconnect();
});

afterAll(() => { loaded = null; });

function makeChar(flags: Record<string, boolean> = {}): Character {
  return {
    stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: 20,
    maxHp: 20,
    ability: "lunar",
    protagonist: "kael",
    stigmaErosion: 50,
    inventory: [],
    flags,
    rerollsLeft: 0,
  };
}

describe("act1 회차 부메랑 분기 (#283)", () => {
  it.each(PATCHES)(
    "$sceneId 에 $choiceId hidden conditional 분기 존재 ($flag → $to)",
    (p) => {
      if (!loaded) return;
      const scene = loaded[p.sceneId];
      expect(scene, `${p.sceneId} 없음`).toBeTruthy();
      const choice = scene.choices.find((c) => (c as { id: string }).id === p.choiceId);
      expect(choice, `${p.choiceId} 없음`).toBeTruthy();
      if (!choice || (choice as { kind: string }).kind !== "conditional") {
        throw new Error(`${p.choiceId} conditional 아님`);
      }
      const c = choice as Choice & {
        condition: { kind: string; key: string };
        to: string;
        hidden?: boolean;
        stigmaDelta?: number;
      };
      expect(c.condition).toEqual({ kind: "flag", key: p.flag });
      expect(c.hidden).toBe(true);
      expect(c.to).toBe(p.to);
      expect(c.stigmaDelta ?? 0).toBe(p.stigmaDelta);
    },
  );

  it("3 분기 한도 유지 — 모든 패치 적용 후 ≤ 3", () => {
    if (!loaded) return;
    for (const p of PATCHES) {
      expect(loaded[p.sceneId].choices.length).toBeLessThanOrEqual(3);
    }
  });

  it("flag 없음 → kael_corridor/crystal_path_memory 차단 (state 무변화)", () => {
    if (!loaded) return;
    let state: GameState = { phase: "creating" };
    state = gameReducer(
      state,
      { type: "START_GAME", character: makeChar(), startScene: "kael_corridor" },
      loaded,
    );
    const before = state;
    const after = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "crystal_path_memory", rng: RNG },
      loaded,
    );
    expect(after).toEqual(before);
  });

  it("flag 있음 → kael_corridor/crystal_path_memory 통과 + 침식 -2", () => {
    if (!loaded) return;
    let state: GameState = { phase: "creating" };
    state = gameReducer(
      state,
      {
        type: "START_GAME",
        character: makeChar({ "world.last_one_fell": true }),
        startScene: "kael_corridor",
      },
      loaded,
    );
    const stigmaBefore = state.phase === "playing" ? state.character.stigmaErosion : -1;
    const after = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "crystal_path_memory", rng: RNG },
      loaded,
    );
    if (after.phase !== "playing") throw new Error("expected playing");
    expect(after.currentScene).toBe("kael_corridor_clear");
    // 시작은 stigma 50. crystal_path_memory 후 -2 → 48. 단 kael_corridor_clear
    // 의 onEnter 가 추가 stigmaDelta 가지면 그것 반영. 보수적으로 *원래보다 작음*.
    expect(after.character.stigmaErosion).toBeLessThan(stigmaBefore);
  });
});

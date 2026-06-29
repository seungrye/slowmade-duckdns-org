// #276 6 world flag 매트릭스 — 각 flag 가 *어딘가의 conditional hidden 분기* 에서 활용된다.
//
// 6 world flag 모두가 *실제로 콘텐츠를 변경한다* 는 시스템 보증.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Scene, SceneRegistry } from "@/types/web-adventure";
import { ENDING_TO_WORLD_FLAG } from "../world-flags";

// world flag → 활용되는 (sceneId, choiceId).
const MATRIX: Record<string, { sceneId: string; choiceId: string }> = {
  "world.harmony_kept": { sceneId: "climax_revolution_path", choiceId: "echo_of_harmony" },
  "world.world_fell": { sceneId: "omphalos_blackmarket", choiceId: "ashen_informant" },
  "world.solaris_strong": { sceneId: "climax_ascension_path", choiceId: "blessed_descent" },
  "world.revolution_won": { sceneId: "omphalos_outskirts", choiceId: "iron_lookout" },
  "world.last_one_fell": { sceneId: "climax_harmony_path", choiceId: "crystal_echo" },
  "world.sylvan_awoke": { sceneId: "climax_sylvan_path", choiceId: "forest_recognized" },
  // #359 각성 루트 회차 부메랑.
  "world.truth_freed": { sceneId: "kael_vale_trust", choiceId: "prior_truth" },
  "world.false_god": { sceneId: "kael_awaken_climax", choiceId: "false_god_echo" },
  // #361 린 각성 루트 회차 부메랑.
  "world.regent_rules": { sceneId: "rin_crossroads", choiceId: "regent_echo" },
  "world.purged": { sceneId: "rin_vale_pursuit", choiceId: "purged_trace" },
  "world.wanderer": { sceneId: "rin_fall_throne", choiceId: "wanderer_echo" },
};

let loaded: SceneRegistry | null = null;

beforeAll(async () => {
  if (!process.env.MONGO_URI) return;
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    "MatrixCheck",
    new mongoose.Schema({}, { strict: false, collection: "webadventurescenes" }),
  );
  const all = (await Scene.find({}).lean()) as unknown as Scene[];
  const r: SceneRegistry = {};
  for (const s of all) r[s.id] = s;
  loaded = r;
  await mongoose.disconnect();
});

afterAll(() => { loaded = null; });

describe("world flag 매트릭스 (#276)", () => {
  it("ENDING_TO_WORLD_FLAG 의 모든 6 flag 가 MATRIX 에 정의", () => {
    const flagsExpected = Object.values(ENDING_TO_WORLD_FLAG);
    expect(new Set(Object.keys(MATRIX))).toEqual(new Set(flagsExpected));
  });

  it.each(Object.entries(MATRIX))(
    "%s 가 콘텐츠에서 실제 활용됨",
    (flag, { sceneId, choiceId }) => {
      if (!loaded) return;
      const scene = loaded[sceneId];
      expect(scene, `scene ${sceneId} 없음`).toBeTruthy();
      const choice = scene.choices.find((c) => (c as { id: string }).id === choiceId);
      expect(choice, `${sceneId}/${choiceId} 없음`).toBeTruthy();
      if (!choice || (choice as { kind: string }).kind !== "conditional") {
        throw new Error(`${choiceId} 는 conditional 아님`);
      }
      const cond = (choice as { condition: { kind: string; key: string }; hidden?: boolean }).condition;
      expect(cond.kind).toBe("flag");
      expect(cond.key).toBe(flag);
      expect((choice as { hidden?: boolean }).hidden).toBe(true);
    },
  );

  it("6 flag 매트릭스 — 각 flag 가 *서로 다른* (sceneId, choiceId) 에 매핑", () => {
    const pairs = Object.values(MATRIX).map((m) => `${m.sceneId}/${m.choiceId}`);
    expect(new Set(pairs).size).toBe(pairs.length); // 중복 없음.
  });
});

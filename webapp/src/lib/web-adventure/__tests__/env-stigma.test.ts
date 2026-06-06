// #264 — 옴팔로스 및 climax 같이 *환경 자체* 가 침식하는 씬은 onEnter.stigmaDelta
// 를 가진다. 콘텐츠 정합성 검증.

import { describe, it, expect } from "vitest";

const EXPECTED_ENV_STIGMA: Record<string, number> = {
  omphalos_outskirts: 1,
  omphalos_station: 2,
  omphalos_blackmarket: 1,
  climax_ascension_path: 3,
  climax_harmony_path: 2,
  climax_revolution_path: 2,
  climax_fall_path: 3,
  climax_sylvan_path: 1,
  station_path_steel: 1,
  station_knowledge_branch: 1,
};

describe("환경 침식 (#264)", () => {
  it("지정된 씬의 onEnter.stigmaDelta 가 명시되어 있다", async () => {
    if (!process.env.MONGO_URI) {
      console.warn("MONGO_URI 없음 — skip");
      return;
    }
    const mongoose = (await import("mongoose")).default;
    await mongoose.connect(process.env.MONGO_URI);
    try {
      const Scene = mongoose.model(
        "EnvCheck",
        new mongoose.Schema({}, { strict: false, collection: "webadventurescenes" }),
      );
      const missing: string[] = [];
      for (const [id, expected] of Object.entries(EXPECTED_ENV_STIGMA)) {
        const scene = (await Scene.findOne({ id }).lean()) as
          | { onEnter?: { stigmaDelta?: number } }
          | null;
        if (!scene) {
          missing.push(`${id} — 없음`);
          continue;
        }
        const actual = scene.onEnter?.stigmaDelta ?? 0;
        if (actual < expected) missing.push(`${id} — ${actual} < ${expected}`);
      }
      expect(missing, missing.join("\n")).toEqual([]);
    } finally {
      await mongoose.disconnect();
    }
  });
});

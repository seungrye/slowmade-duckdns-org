// #263 — 마법/마법공학 확률 분기의 실패에는 추가 침식 (stigmaDeltaOnFailure) 이
// 명시되어 있어야 한다. 주문 통제 실패 = 더 큰 신체 부담의 가정.

import { describe, it, expect } from "vitest";

const EXPECTED: Array<{ sceneId: string; choiceId: string; minOnFailure: number }> = [
  { sceneId: "kael_infirmary", choiceId: "overload_panel", minOnFailure: 3 },
  { sceneId: "solwen_grove", choiceId: "frighten_chant", minOnFailure: 2 },
  { sceneId: "solwen_combat", choiceId: "shield_spirit", minOnFailure: 3 },
  { sceneId: "kael_corridor", choiceId: "forge_id", minOnFailure: 2 },
  { sceneId: "station_path_steel", choiceId: "hijack", minOnFailure: 3 },
  { sceneId: "climax_harmony_path", choiceId: "still_the_engine", minOnFailure: 10 },
];

describe("마법 실패 추가 침식 (#263)", () => {
  it("지정 분기들에 stigmaDeltaOnFailure 가 명시되어 있다", async () => {
    if (!process.env.MONGO_URI) {
      console.warn("MONGO_URI 없음 — skip");
      return;
    }
    const mongoose = (await import("mongoose")).default;
    await mongoose.connect(process.env.MONGO_URI);
    try {
      const Scene = mongoose.model(
        "MagicCheck",
        new mongoose.Schema({}, { strict: false, collection: "webadventurescenes" }),
      );
      const missing: string[] = [];
      for (const expect_ of EXPECTED) {
        const scene = (await Scene.findOne({ id: expect_.sceneId }).lean()) as
          | { choices?: Array<{ id: string; stigmaDeltaOnFailure?: number }> }
          | null;
        if (!scene) {
          missing.push(`${expect_.sceneId}/${expect_.choiceId} — scene 없음`);
          continue;
        }
        const choice = scene.choices?.find((c) => c.id === expect_.choiceId);
        if (!choice) {
          missing.push(`${expect_.sceneId}/${expect_.choiceId} — choice 없음`);
          continue;
        }
        const actual = choice.stigmaDeltaOnFailure ?? 0;
        if (actual < expect_.minOnFailure) {
          missing.push(`${expect_.sceneId}/${expect_.choiceId} — ${actual} < ${expect_.minOnFailure}`);
        }
      }
      expect(missing, missing.join("\n")).toEqual([]);
    } finally {
      await mongoose.disconnect();
    }
  });
});

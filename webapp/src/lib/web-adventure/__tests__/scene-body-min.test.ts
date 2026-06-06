// #267 — 모든 (엔딩 외) 씬의 body 는 3 줄 이상 (분위기 보강).

import { describe, it, expect } from "vitest";

describe("씬 body 최소 줄수 (#267)", () => {
  it("엔딩 외 모든 씬의 body 는 3 줄 이상", async () => {
    if (!process.env.MONGO_URI) {
      console.warn("MONGO_URI 없음 — skip");
      return;
    }
    const mongoose = (await import("mongoose")).default;
    await mongoose.connect(process.env.MONGO_URI);
    try {
      const Scene = mongoose.model(
        "BodyMinCheck",
        new mongoose.Schema({}, { strict: false, collection: "webadventurescenes" }),
      );
      const all = (await Scene.find({}).lean()) as unknown as Array<{
        id: string;
        body?: string[];
      }>;
      const tooShort = all
        .filter((s) => !s.id.startsWith("ending_"))
        .map((s) => ({ id: s.id, count: (s.body ?? []).length }))
        .filter((s) => s.count < 3);
      expect(
        tooShort,
        `body 3 줄 미만: ${tooShort.map((s) => `${s.id}(${s.count})`).join(", ")}`,
      ).toEqual([]);
    } finally {
      await mongoose.disconnect();
    }
  });
});

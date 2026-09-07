// #262 - a UX policy: *at most 3* choices in one scene. The user's decision.
//
// More on screen means cognitive load and scrolling on mobile. When 4 or more branches are genuinely needed, it is
// split into *2 scenes* - *choosing an approach* and then *that approach's detailed branches*.

import { describe, it, expect } from "vitest";

describe("씬 선택지 개수 제한 (#262)", () => {
  it("모든 씬의 choices 가 3 개 이하 (mongo content)", async () => {
    // With no static fallback, mongo is the single source. This test queries *production or local* mongo directly.
    // It verifies when MONGO_URI is present at run time and skips otherwise (safe in CI).
    if (!process.env.MONGO_URI) {
      console.warn("MONGO_URI 없음 — skip");
      return;
    }
    const mongoose = (await import("mongoose")).default;
    await mongoose.connect(process.env.MONGO_URI);
    try {
      const Scene = mongoose.model(
        "SceneCheck",
        new mongoose.Schema({}, { strict: false, collection: "webadventurescenes" }),
      );
      const all = (await Scene.find({ isDeleted: { $ne: true } }).lean()) as unknown as Array<{
        id: string;
        choices?: Array<{ hidden?: boolean }>;
      }>;
      // What is counted is the choices that *actually appear on screen* (#91).
      //   A conditional with hidden: true is visible only to someone who met the condition. climax_harmony_path,
      //   for instance, carries four stigma-specific branches, but since one only ever has a single stigma,
      //   a person sees two or three at most. Counting them all would be a false positive.
      const visible = (s: { choices?: Array<{ hidden?: boolean }> }) =>
        (s.choices ?? []).filter((c) => c?.hidden !== true).length;
      const tooMany = all
        .map((s) => ({ id: s.id, count: visible(s) }))
        .filter((s) => s.count > 3);
      expect(tooMany, `3 분기 초과 씬: ${tooMany.map((s: { id: string; count: number }) => `${s.id}(${s.count})`).join(", ")}`).toEqual([]);
    } finally {
      await mongoose.disconnect();
    }
  });
});

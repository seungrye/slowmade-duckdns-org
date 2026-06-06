// #262 — UX 정책: 한 씬의 선택지는 *최대 3 개*. 사용자가 결정.
//
// 더 많이 노출되면 화면 인지부하 + 모바일 스크롤. 4+ 분기가 필요한 시점은
// *접근 방식 선택* + *각 방식의 세부 분기* 로 *2 씬* 분리한다.

import { describe, it, expect } from "vitest";

describe("씬 선택지 개수 제한 (#262)", () => {
  it("모든 씬의 choices 가 3 개 이하 (mongo content)", async () => {
    // 정적 fallback 없으므로 mongo 가 단일 소스. 본 테스트는 *프로덕션 또는 로컬* mongo 직접 조회.
    // 실행 시점에 MONGO_URI 가 있으면 검증, 없으면 skip (CI 안전).
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
      const all = (await Scene.find({}).lean()) as unknown as Array<{
        id: string;
        choices?: unknown[];
      }>;
      const tooMany = all
        .map((s) => ({ id: s.id, count: (s.choices ?? []).length }))
        .filter((s) => s.count > 3);
      expect(tooMany, `3 분기 초과 씬: ${tooMany.map((s: { id: string; count: number }) => `${s.id}(${s.count})`).join(", ")}`).toEqual([]);
    } finally {
      await mongoose.disconnect();
    }
  });
});

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
      const all = (await Scene.find({ isDeleted: { $ne: true } }).lean()) as unknown as Array<{
        id: string;
        choices?: Array<{ hidden?: boolean }>;
      }>;
      // 세는 것은 *화면에 실제로 뜨는* 선택지다 (#91).
      //   hidden: true 인 conditional 은 조건을 채운 사람에게만 보인다. 예컨대
      //   climax_harmony_path 는 성흔별 분기를 넷 달고 있지만 성흔은 하나만 가지므로
      //   한 사람이 보는 것은 많아야 두셋이다. 그걸 세면 오탐이 난다.
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

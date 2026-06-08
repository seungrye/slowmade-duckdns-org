// #345 분기별 다른 흐름 분리 — 6 씬의 probability 분기가 더 이상
// *모두 같은 destination* 으로 흐르지 않고 *각 분기별 우회/결과 씬* 으로 분리됨을 검증.
//
// 정책 — A success → C-1, B success → C-2 처럼 *분기 식별 가능한 destination*.
// 합류 후 공통 합류 씬으로 흐르는 것은 허용 (사용자 명시).
//
// 검증 — 6 씬 각각의 onSuccess 집합과 onFailure 집합 크기가 분기 수와 일치해야 함.
//   예외 — kael_infirmary 의 fake_flatline onFailure 는 kael_caught (석화 직행) 로 유지.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Scene, SceneRegistry } from "@/types/web-adventure";

interface ExpectedDivergence {
  sceneId: string;
  /** success 경로 분기 id 들 — 각각 *서로 다른* onSuccess 를 가져야 함. */
  successChoiceIds: string[];
  /** failure 경로 분기 id 들 — 각각 *서로 다른* onFailure 를 가져야 함. */
  failureChoiceIds: string[];
  /** 동일 onFailure 를 명시적으로 허용 (예: kael_infirmary/fake_flatline → kael_caught 석화 직행). */
  sharedFailureChoiceIds?: string[];
}

const EXPECTED: ExpectedDivergence[] = [
  {
    sceneId: "kael_infirmary",
    successChoiceIds: ["grab_scalpel", "overload_panel", "fake_flatline"],
    failureChoiceIds: ["grab_scalpel", "overload_panel"],
    sharedFailureChoiceIds: ["fake_flatline"],
  },
  {
    sceneId: "rin_harbor",
    successChoiceIds: ["shoot_lock", "sneak_closer", "badge_arrest"],
    failureChoiceIds: ["shoot_lock", "sneak_closer", "badge_arrest"],
  },
  {
    sceneId: "rin_betrayal",
    successChoiceIds: ["shoot_first", "talk_down", "window_escape"],
    failureChoiceIds: ["shoot_first", "talk_down", "window_escape"],
  },
  {
    sceneId: "solwen_grove",
    successChoiceIds: ["arrow_first", "wake_spirit", "frighten_chant"],
    failureChoiceIds: ["arrow_first", "wake_spirit", "frighten_chant"],
  },
  {
    sceneId: "solwen_combat",
    successChoiceIds: ["shoot_canister", "shield_spirit"],
    failureChoiceIds: ["shoot_canister", "shield_spirit"],
  },
  {
    sceneId: "station_path_steel",
    successChoiceIds: ["derail", "hijack"],
    failureChoiceIds: ["derail", "hijack"],
  },
];

describe("#345 분기별 다른 흐름 분리", () => {
  let registry: SceneRegistry | null = null;

  beforeAll(async () => {
    if (!process.env.MONGO_URI) return;
    const mongoose = (await import("mongoose")).default;
    await mongoose.connect(process.env.MONGO_URI);
    const Scene = mongoose.model(
      "BranchDivergence",
      new mongoose.Schema({}, { strict: false, collection: "webadventurescenes" }),
    );
    const all = (await Scene.find({}).lean()) as unknown as Scene[];
    const r: SceneRegistry = {};
    for (const s of all) r[s.id] = s;
    registry = r;
    await mongoose.disconnect();
  });

  afterAll(() => {
    registry = null;
  });

  for (const ex of EXPECTED) {
    it(`${ex.sceneId} 의 success 분기는 서로 다른 destination 으로 분리되어 있다`, () => {
      if (!registry) return;
      const scene = registry[ex.sceneId];
      expect(scene).toBeTruthy();
      const successTargets = ex.successChoiceIds.map((cid) => {
        const c = (scene.choices ?? []).find((c) => c.id === cid) as Record<string, unknown> | undefined;
        return c?.onSuccess as string | undefined;
      });
      // 모두 존재.
      for (const t of successTargets) expect(t).toBeTruthy();
      // 모두 서로 다름.
      expect(new Set(successTargets).size).toBe(ex.successChoiceIds.length);
    });

    it(`${ex.sceneId} 의 failure 분기는 서로 다른 destination 으로 분리되어 있다 (공유 허용 제외)`, () => {
      if (!registry) return;
      const scene = registry[ex.sceneId];
      expect(scene).toBeTruthy();
      const failureTargets = ex.failureChoiceIds.map((cid) => {
        const c = (scene.choices ?? []).find((c) => c.id === cid) as Record<string, unknown> | undefined;
        return c?.onFailure as string | undefined;
      });
      for (const t of failureTargets) expect(t).toBeTruthy();
      expect(new Set(failureTargets).size).toBe(ex.failureChoiceIds.length);
    });
  }
});

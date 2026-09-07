// #345 separating the flows per branch - it verifies that the probability branches in 6 scenes no longer
// all flow to *the same destination* but split into *a detour or outcome scene per branch*.
//
// The policy - *a destination that identifies the branch*, as in A success -> C-1 and B success -> C-2.
// Flowing into a shared scene after they converge is allowed (as the user specified).
//
// The check - the size of each of the 6 scenes' onSuccess and onFailure sets must equal the branch count.
//   The exception - kael_infirmary's fake_flatline onFailure stays as kael_caught (straight to petrification).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Scene, SceneRegistry } from "@/types/web-adventure";

interface ExpectedDivergence {
  sceneId: string;
  /** The success-path branch ids - each must have a *different* onSuccess. */
  successChoiceIds: string[];
  /** The failure-path branch ids - each must have a *different* onFailure. */
  failureChoiceIds: string[];
  /** Explicitly allowing an identical onFailure (kael_infirmary/fake_flatline -> kael_caught, straight to petrification). */
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
      // all present.
      for (const t of successTargets) expect(t).toBeTruthy();
      // all different.
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

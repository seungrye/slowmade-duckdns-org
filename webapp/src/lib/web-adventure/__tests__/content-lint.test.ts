// #271 content structure lint - orphan scenes, dead-end choices, the 3-branch limit and 6-ending reachability.
//
// A single lint function evaluates every rule and returns *a list of violations*. The lint function is
// pure (no mongo dependency) - the caller injects the sceneRegistry. vitest loads the real content from mongo
// and verifies the lint result is empty.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Scene, SceneRegistry, EndingId } from "@/types/web-adventure";
import { lintSceneContent } from "../lint";

const ALL_ENDINGS: EndingId[] = [
  "ascension",
  "revolution",
  "harmony",
  "fall",
  "petrification",
  "sylvan_bond",
];

function makeScene(over: Partial<Scene> & { id: string; choices?: Scene["choices"] }): Scene {
  return {
    id: over.id,
    illustration: "/x.svg",
    title: over.id,
    body: ["body"],
    choices: over.choices ?? [],
    ...(over.isEnding ? { isEnding: true, endingId: over.endingId } : {}),
  } as Scene;
}

describe("콘텐츠 구조 lint (#271)", () => {
  it("orphan: 어디서도 참조되지 않는 씬 (시작 씬 제외)", () => {
    const reg: SceneRegistry = {
      start: makeScene({ id: "start", choices: [{ kind: "plain", id: "to_end", label: "끝", to: "end" }] }),
      end: makeScene({ id: "end", isEnding: true, endingId: "fall" }),
      orphan: makeScene({ id: "orphan" }),
    };
    const r = lintSceneContent(reg, { startSceneIds: ["start"] });
    expect(r.issues.find((i) => i.code === "ORPHAN" && i.sceneId === "orphan")).toBeTruthy();
  });

  it("dead-end: choices 가 비었는데 isEnding=false", () => {
    const reg: SceneRegistry = {
      start: makeScene({ id: "start", choices: [{ kind: "plain", id: "to_dead", label: "->", to: "dead" }] }),
      dead: makeScene({ id: "dead" /* choices [] + isEnding false */ }),
    };
    const r = lintSceneContent(reg, { startSceneIds: ["start"] });
    expect(r.issues.find((i) => i.code === "DEAD_END" && i.sceneId === "dead")).toBeTruthy();
  });

  it("choices 가 6 개 초과 = TOO_MANY_CHOICES (pool 상한 6, 화면은 랜덤 3-of-N)", () => {
    const reg: SceneRegistry = {
      s: makeScene({
        id: "s",
        choices: Array.from({ length: 7 }, (_, i) => ({ kind: "plain", id: `c${i}`, label: "x", to: "e" })),
      }),
      e: makeScene({ id: "e", isEnding: true, endingId: "fall" }),
    };
    const r = lintSceneContent(reg, { startSceneIds: ["s"] });
    expect(r.issues.find((i) => i.code === "TOO_MANY_CHOICES" && i.sceneId === "s")).toBeTruthy();
  });

  it("미도달 endingId = UNREACHABLE_ENDING", () => {
    const reg: SceneRegistry = {
      start: makeScene({ id: "start", choices: [{ kind: "plain", id: "to_end", label: "끝", to: "end_fall" }] }),
      end_fall: makeScene({ id: "end_fall", isEnding: true, endingId: "fall" }),
    };
    const r = lintSceneContent(reg, { startSceneIds: ["start"], requiredEndings: ALL_ENDINGS });
    // only fall is reachable -> the other 5 are UNREACHABLE_ENDING.
    const unreachable = r.issues.filter((i) => i.code === "UNREACHABLE_ENDING").map((i) => i.endingId);
    expect(new Set(unreachable)).toEqual(new Set(ALL_ENDINGS.filter((e) => e !== "fall")));
  });

  it("dangling: choice 가 가리키는 to/onSuccess/onFailure 가 sceneRegistry 에 없음", () => {
    const reg: SceneRegistry = {
      start: makeScene({
        id: "start",
        choices: [{ kind: "plain", id: "to_nowhere", label: "x", to: "missing_scene" }],
      }),
    };
    const r = lintSceneContent(reg, { startSceneIds: ["start"] });
    expect(
      r.issues.find((i) => i.code === "DANGLING_REF" && i.sceneId === "start"),
    ).toBeTruthy();
  });
});

// Linting the real mongo content - every rule passes.
describe("실 콘텐츠 lint (#271)", () => {
  let registry: SceneRegistry | null = null;

  beforeAll(async () => {
    if (!process.env.MONGO_URI) return;
    const mongoose = (await import("mongoose")).default;
    await mongoose.connect(process.env.MONGO_URI);
    const Scene = mongoose.model(
      "LintCheck",
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

  it("모든 lint 규칙 통과 (orphan / dead-end / 3분기 / 6 엔딩 도달 / dangling)", () => {
    if (!registry) return;
    const r = lintSceneContent(registry, {
      startSceneIds: ["kael_infirmary", "rin_harbor", "solwen_grove"],
      requiredEndings: ALL_ENDINGS,
      // #327 - *_caught/_chase are *reused* as the detour scenes' plain self-sacrifice branch and so are reachable.
      //   ending_petrification was deleted (a leftover of the automatic ending). With no scene it is handled
      //   directly through the endingId whitelist.
      autoEndingSceneIds: [],
      autoEndingIds: ["petrification"],
    });
    // On failure, print every violation.
    if (r.issues.length > 0) {
      const grouped = r.issues
        .map((i) => `[${i.code}] ${i.sceneId ?? i.endingId ?? "?"}${i.detail ? " — " + i.detail : ""}`)
        .join("\n");
      console.error(grouped);
    }
    expect(r.issues).toEqual([]);
  });
});

// #271 콘텐츠 구조 lint — orphan scene / dead-end choice / 분기 3 제한 / 6 엔딩 도달성.
//
// 단일 lint 함수에서 모든 규칙을 평가하고 *위반 리스트* 를 반환한다. lint 함수는
// 순수 (mongo 의존 X) — 호출 측에서 sceneRegistry 를 주입한다. vitest 는 mongo 의
// 실 콘텐츠를 로드해 lint 결과가 비어 있는지 검증.

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

  it("choices 가 3 개 초과 = TOO_MANY_CHOICES", () => {
    const reg: SceneRegistry = {
      s: makeScene({
        id: "s",
        choices: Array.from({ length: 4 }, (_, i) => ({ kind: "plain", id: `c${i}`, label: "x", to: "e" })),
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
    // fall 만 도달 가능 → 나머지 5 종이 UNREACHABLE_ENDING.
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

// 실 mongo content lint — 모든 규칙 통과.
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
      // reducer 자동 전환 (stigma ≥ 100) — 그래프 분기 target 없는 정상 케이스.
      autoEndingSceneIds: ["ending_petrification"],
    });
    // 실패 시 위반 전체 출력.
    if (r.issues.length > 0) {
      const grouped = r.issues
        .map((i) => `[${i.code}] ${i.sceneId ?? i.endingId ?? "?"}${i.detail ? " — " + i.detail : ""}`)
        .join("\n");
      console.error(grouped);
    }
    expect(r.issues).toEqual([]);
  });
});

// lint.ts 순수 단위 — mongo 없이 직접 (#308).
//
// 기존 content-lint.test.ts 는 *실 mongo 통합* 검증. 순수 함수 자체의 *규칙별 정합*
// 은 메모리상 sceneRegistry 만으로 검증 가능.

import { describe, it, expect } from "vitest";
import type { Scene, SceneRegistry } from "@/types/web-adventure";
import { lintSceneContent } from "./lint";

function makeScene(over: Partial<Scene> & { id: string }): Scene {
  return {
    id: over.id,
    title: over.id,
    illustration: "/x.svg",
    body: ["b"],
    choices: [],
    ...over,
  } as Scene;
}

describe("lintSceneContent — ORPHAN", () => {
  it("시작 씬에서 도달 불가 → ORPHAN", () => {
    const reg: SceneRegistry = {
      start: makeScene({ id: "start" }),
      orphan: makeScene({ id: "orphan" }),
    };
    const r = lintSceneContent(reg, { startSceneIds: ["start"] });
    expect(r.issues.some((i) => i.code === "ORPHAN" && i.sceneId === "orphan")).toBe(true);
  });

  it("autoEndingSceneIds 의 ending 은 ORPHAN 제외", () => {
    const reg: SceneRegistry = {
      start: makeScene({ id: "start" }),
      ending_petrification: makeScene({
        id: "ending_petrification",
        isEnding: true,
        endingId: "petrification",
      }),
    };
    const r = lintSceneContent(reg, {
      startSceneIds: ["start"],
      autoEndingSceneIds: ["ending_petrification"],
    });
    expect(r.issues.find((i) => i.code === "ORPHAN" && i.sceneId === "ending_petrification")).toBeUndefined();
  });
});

describe("lintSceneContent — DEAD_END", () => {
  it("choices [] + isEnding=false → DEAD_END", () => {
    const reg: SceneRegistry = {
      start: makeScene({ id: "start", choices: [{ kind: "plain", id: "p", label: "x", to: "dead" }] }),
      dead: makeScene({ id: "dead" /* 빈 choices + isEnding=false */ }),
    };
    const r = lintSceneContent(reg, { startSceneIds: ["start"] });
    expect(r.issues.some((i) => i.code === "DEAD_END" && i.sceneId === "dead")).toBe(true);
  });

  it("ending 씬 (isEnding=true + choices []) → DEAD_END 아님", () => {
    const reg: SceneRegistry = {
      start: makeScene({ id: "start", choices: [{ kind: "plain", id: "p", label: "x", to: "end" }] }),
      end: makeScene({ id: "end", isEnding: true, endingId: "harmony" }),
    };
    const r = lintSceneContent(reg, { startSceneIds: ["start"] });
    expect(r.issues.find((i) => i.code === "DEAD_END")).toBeUndefined();
  });
});

describe("lintSceneContent — TOO_MANY_CHOICES", () => {
  it("choices > 3 → TOO_MANY_CHOICES", () => {
    const reg: SceneRegistry = {
      s: makeScene({
        id: "s",
        choices: Array.from({ length: 4 }, (_, i) => ({ kind: "plain", id: `c${i}`, label: "x", to: "e" })),
      }),
      e: makeScene({ id: "e", isEnding: true, endingId: "fall" }),
    };
    const r = lintSceneContent(reg, { startSceneIds: ["s"] });
    expect(r.issues.some((i) => i.code === "TOO_MANY_CHOICES" && i.sceneId === "s")).toBe(true);
  });

  it("maxChoices 옵션으로 임계 조정 가능 (예: 2)", () => {
    const reg: SceneRegistry = {
      s: makeScene({
        id: "s",
        choices: [
          { kind: "plain", id: "c1", label: "x", to: "e" },
          { kind: "plain", id: "c2", label: "x", to: "e" },
          { kind: "plain", id: "c3", label: "x", to: "e" },
        ],
      }),
      e: makeScene({ id: "e", isEnding: true, endingId: "fall" }),
    };
    const r = lintSceneContent(reg, { startSceneIds: ["s"], maxChoices: 2 });
    expect(r.issues.some((i) => i.code === "TOO_MANY_CHOICES")).toBe(true);
  });
});

describe("lintSceneContent — DANGLING_REF", () => {
  it("plain.to 가 미존재 → DANGLING_REF", () => {
    const reg: SceneRegistry = {
      start: makeScene({ id: "start", choices: [{ kind: "plain", id: "p", label: "x", to: "nowhere" }] }),
    };
    const r = lintSceneContent(reg, { startSceneIds: ["start"] });
    expect(r.issues.some((i) => i.code === "DANGLING_REF" && i.sceneId === "start")).toBe(true);
  });

  it("probability.onSuccess / onFailure 미존재 → 2 DANGLING_REF", () => {
    const reg: SceneRegistry = {
      start: makeScene({
        id: "start",
        choices: [{
          kind: "probability", id: "pr", label: "x",
          stat: "str", difficulty: 12,
          onSuccess: "no_ok", onFailure: "no_fail",
        }],
      }),
    };
    const r = lintSceneContent(reg, { startSceneIds: ["start"] });
    expect(r.issues.filter((i) => i.code === "DANGLING_REF").length).toBe(2);
  });
});

describe("lintSceneContent — UNREACHABLE_ENDING", () => {
  it("requiredEndings 중 도달 불가 → UNREACHABLE_ENDING 으로 endingId 표시", () => {
    const reg: SceneRegistry = {
      start: makeScene({ id: "start", choices: [{ kind: "plain", id: "p", label: "x", to: "end" }] }),
      end: makeScene({ id: "end", isEnding: true, endingId: "fall" }),
    };
    const r = lintSceneContent(reg, {
      startSceneIds: ["start"],
      requiredEndings: ["fall", "harmony", "ascension"],
    });
    const unreachable = r.issues.filter((i) => i.code === "UNREACHABLE_ENDING").map((i) => i.endingId);
    expect(new Set(unreachable)).toEqual(new Set(["harmony", "ascension"]));
  });

  it("autoEndingSceneIds 의 endingId 는 UNREACHABLE_ENDING 검사 제외", () => {
    const reg: SceneRegistry = {
      start: makeScene({ id: "start", choices: [{ kind: "plain", id: "p", label: "x", to: "fall_end" }] }),
      fall_end: makeScene({ id: "fall_end", isEnding: true, endingId: "fall" }),
      ending_petrification: makeScene({
        id: "ending_petrification",
        isEnding: true,
        endingId: "petrification",
      }),
    };
    const r = lintSceneContent(reg, {
      startSceneIds: ["start"],
      requiredEndings: ["fall", "petrification"],
      autoEndingSceneIds: ["ending_petrification"],
    });
    expect(r.issues.find((i) => i.code === "UNREACHABLE_ENDING")).toBeUndefined();
  });
});

describe("lintSceneContent — 정상 케이스", () => {
  it("완전한 그래프 → issues = []", () => {
    const reg: SceneRegistry = {
      start: makeScene({ id: "start", choices: [{ kind: "plain", id: "p", label: "x", to: "end" }] }),
      end: makeScene({ id: "end", isEnding: true, endingId: "harmony" }),
    };
    const r = lintSceneContent(reg, {
      startSceneIds: ["start"],
      requiredEndings: ["harmony"],
    });
    expect(r.issues).toEqual([]);
  });
});

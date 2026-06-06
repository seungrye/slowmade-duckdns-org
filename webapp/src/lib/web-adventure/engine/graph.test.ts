// graph.ts — buildGraphFromScenes / autoLayout 단위 (#301).

import { describe, it, expect } from "vitest";
import {
  buildGraphFromScenes,
  autoLayout,
  type SceneWithPosition,
} from "./graph";
import type { Choice } from "@/types/web-adventure";

function makeScene(over: Partial<SceneWithPosition> & { id: string }): SceneWithPosition {
  return {
    title: over.id,
    illustration: "/x.svg",
    body: ["body"],
    choices: [],
    ...over,
  } as SceneWithPosition;
}

describe("buildGraphFromScenes — nodes", () => {
  it("씬 N 개 → 노드 N 개 (1:1)", () => {
    const { nodes } = buildGraphFromScenes([
      makeScene({ id: "a" }),
      makeScene({ id: "b" }),
      makeScene({ id: "c" }),
    ]);
    expect(nodes).toHaveLength(3);
    expect(nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("isEnding 씬 → data.isEnding + endingId 포함", () => {
    const { nodes } = buildGraphFromScenes([
      makeScene({ id: "ending_h", isEnding: true, endingId: "harmony" }),
    ]);
    expect(nodes[0].data.isEnding).toBe(true);
    expect(nodes[0].data.endingId).toBe("harmony");
  });

  it("savedPosition 있는 씬 → data.savedPosition 보존", () => {
    const { nodes } = buildGraphFromScenes([
      makeScene({ id: "s", position: { x: 100, y: 200 } }),
    ]);
    expect(nodes[0].data.savedPosition).toEqual({ x: 100, y: 200 });
    expect(nodes[0].position).toEqual({ x: 100, y: 200 });
  });
});

describe("buildGraphFromScenes — edges", () => {
  it("plain choice → 1 edge (kind=plain)", () => {
    const plain: Choice = { kind: "plain", id: "p", label: "->", to: "b" };
    const { edges } = buildGraphFromScenes([
      makeScene({ id: "a", choices: [plain] }),
      makeScene({ id: "b" }),
    ]);
    expect(edges).toHaveLength(1);
    expect(edges[0].source).toBe("a");
    expect(edges[0].target).toBe("b");
    expect(edges[0].data?.kind).toBe("plain");
  });

  it("probability choice → 2 edges (success + failure / branch 표시)", () => {
    const prob: Choice = {
      kind: "probability",
      id: "pr",
      label: "x",
      stat: "str",
      difficulty: 12,
      onSuccess: "ok",
      onFailure: "fail",
    };
    const { edges } = buildGraphFromScenes([
      makeScene({ id: "a", choices: [prob] }),
      makeScene({ id: "ok" }),
      makeScene({ id: "fail" }),
    ]);
    expect(edges).toHaveLength(2);
    const success = edges.find((e) => e.target === "ok")!;
    const failure = edges.find((e) => e.target === "fail")!;
    expect(success.data?.branch).toBe("success");
    expect(failure.data?.branch).toBe("failure");
  });

  it("conditional choice → 1 edge (kind=conditional, hidden 정보 포함)", () => {
    const cond: Choice = {
      kind: "conditional",
      id: "c",
      label: "x",
      condition: { kind: "flag", key: "f" },
      to: "next",
      hidden: true,
    };
    const { edges } = buildGraphFromScenes([
      makeScene({ id: "a", choices: [cond] }),
      makeScene({ id: "next" }),
    ]);
    expect(edges).toHaveLength(1);
    expect(edges[0].data?.kind).toBe("conditional");
    expect(edges[0].data?.hidden).toBe(true);
  });

  it("3 분기 (plain + probability + conditional) → 4 edges 합산", () => {
    const choices: Choice[] = [
      { kind: "plain", id: "p1", label: "x", to: "b" },
      {
        kind: "probability",
        id: "pr",
        label: "x",
        stat: "dex",
        difficulty: 10,
        onSuccess: "c",
        onFailure: "d",
      },
      {
        kind: "conditional",
        id: "co",
        label: "x",
        condition: { kind: "flag", key: "k" },
        to: "e",
      },
    ];
    const { edges } = buildGraphFromScenes([
      makeScene({ id: "a", choices }),
      makeScene({ id: "b" }),
      makeScene({ id: "c" }),
      makeScene({ id: "d" }),
      makeScene({ id: "e" }),
    ]);
    expect(edges).toHaveLength(4);
  });
});

describe("autoLayout", () => {
  it("savedPosition 없는 노드는 dagre 가 좌표 할당 (음수 아닌 finite)", () => {
    const { nodes, edges } = buildGraphFromScenes([
      makeScene({ id: "a", choices: [{ kind: "plain", id: "p", label: "x", to: "b" }] }),
      makeScene({ id: "b" }),
    ]);
    const laid = autoLayout(nodes, edges);
    expect(laid).toHaveLength(2);
    for (const n of laid) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
  });

  it("savedPosition 있는 노드는 그 좌표 유지", () => {
    const fixed = { x: 999, y: 888 };
    const { nodes, edges } = buildGraphFromScenes([
      makeScene({ id: "a", position: fixed }),
      makeScene({ id: "b" }),
    ]);
    const laid = autoLayout(nodes, edges);
    const aNode = laid.find((n) => n.id === "a")!;
    expect(aNode.position).toEqual(fixed);
  });
});

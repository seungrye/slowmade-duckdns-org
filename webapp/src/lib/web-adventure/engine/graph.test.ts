// graph.ts — Scene[] → ReactFlow nodes/edges 변환 단위 테스트.
// #222 (6 주차) — /scenes/graph 편집 차트.

import { describe, it, expect } from "vitest";
import type { Scene } from "@/types/web-adventure";
import { buildGraphFromScenes, autoLayout } from "./graph";

const startScene: Scene = {
  id: "town_square_dawn",
  illustration: "x.png",
  title: "시작",
  body: ["…"],
  choices: [
    { kind: "plain", id: "c1", label: "시장", to: "market_morning" },
    {
      kind: "probability",
      id: "c2",
      label: "잠입",
      stat: "dex",
      difficulty: 10,
      onSuccess: "market_storage_success",
      onFailure: "market_caught",
    },
    {
      kind: "conditional",
      id: "c3",
      label: "은밀히",
      condition: { kind: "flag", key: "hasGlasses" },
      to: "forest_inner",
      hidden: true,
    },
  ],
};

const plainScene: Scene = {
  id: "market_morning",
  illustration: "x.png",
  title: "시장",
  body: ["…"],
  choices: [
    { kind: "plain", id: "c1", label: "구매", to: "market_buy" },
  ],
};

const endingScene: Scene = {
  id: "ending_main",
  illustration: "x.png",
  title: "엔딩",
  body: ["…"],
  choices: [],
  isEnding: true,
  endingId: "main",
};

const allScenes: Scene[] = [startScene, plainScene, endingScene];

describe("buildGraphFromScenes — 노드/엣지 생성", () => {
  it("30 씬 입력 → 30 노드 생성", () => {
    const many: Scene[] = Array.from({ length: 30 }).map((_, i) => ({
      id: `scene_${i}`,
      illustration: "x.png",
      title: `씬 ${i}`,
      body: ["…"],
      choices: [],
    }));
    const { nodes } = buildGraphFromScenes(many);
    expect(nodes.length).toBe(30);
  });

  it("plain choice → 1 edge (source → target)", () => {
    const { edges } = buildGraphFromScenes([plainScene]);
    expect(edges.length).toBe(1);
    expect(edges[0].source).toBe("market_morning");
    expect(edges[0].target).toBe("market_buy");
    expect(edges[0].data?.kind).toBe("plain");
  });

  it("probability choice → 2 edges (success + failure)", () => {
    const sceneOnly: Scene = {
      ...startScene,
      choices: [startScene.choices[1]],
    };
    const { edges } = buildGraphFromScenes([sceneOnly]);
    expect(edges.length).toBe(2);
    const successEdge = edges.find((e) => e.data?.branch === "success");
    const failureEdge = edges.find((e) => e.data?.branch === "failure");
    expect(successEdge?.target).toBe("market_storage_success");
    expect(failureEdge?.target).toBe("market_caught");
    expect(successEdge?.data?.kind).toBe("probability");
  });

  it("conditional hidden=true choice → edge 의 data.hidden=true (점선 표시 prop)", () => {
    const sceneOnly: Scene = {
      ...startScene,
      choices: [startScene.choices[2]],
    };
    const { edges } = buildGraphFromScenes([sceneOnly]);
    expect(edges.length).toBe(1);
    expect(edges[0].data?.kind).toBe("conditional");
    expect(edges[0].data?.hidden).toBe(true);
  });

  it("엔딩 씬은 outgoing edge X (choices=[])", () => {
    const { edges } = buildGraphFromScenes([endingScene]);
    expect(edges.length).toBe(0);
  });

  it("엔딩 노드는 data.endingId 가 노드 data 에 반영", () => {
    const { nodes } = buildGraphFromScenes([endingScene]);
    const node = nodes[0];
    expect(node.data.endingId).toBe("main");
    expect(node.data.isEnding).toBe(true);
  });

  it("시작 씬 (town_square_dawn) 은 data.isStart=true", () => {
    const { nodes } = buildGraphFromScenes(allScenes);
    const start = nodes.find((n) => n.id === "town_square_dawn");
    expect(start?.data.isStart).toBe(true);
    const market = nodes.find((n) => n.id === "market_morning");
    expect(market?.data.isStart).toBeFalsy();
  });

  it("position 저장된 씬은 node.position 으로 반영", () => {
    const sceneWithPos: Scene & { position?: { x: number; y: number } } = {
      ...plainScene,
      position: { x: 123, y: 456 },
    };
    const { nodes } = buildGraphFromScenes([sceneWithPos as Scene]);
    expect(nodes[0].position).toEqual({ x: 123, y: 456 });
    expect(nodes[0].data.savedPosition).toEqual({ x: 123, y: 456 });
  });

  it("position 없는 씬은 node.data.savedPosition 이 undefined", () => {
    const { nodes } = buildGraphFromScenes([plainScene]);
    expect(nodes[0].data.savedPosition).toBeUndefined();
  });
});

describe("autoLayout — dagre 자동 레이아웃", () => {
  it("savedPosition 없는 노드는 dagre 가 계산한 좌표 반영", () => {
    const { nodes, edges } = buildGraphFromScenes(allScenes);
    const laid = autoLayout(nodes, edges);
    // 모두 좌표가 유한 숫자여야 함
    for (const n of laid) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
  });

  it("savedPosition 있는 노드는 dagre 결과 무시 + savedPosition 그대로", () => {
    const sceneWithPos: Scene & { position?: { x: number; y: number } } = {
      ...plainScene,
      position: { x: 999, y: 888 },
    };
    const { nodes, edges } = buildGraphFromScenes([startScene, sceneWithPos as Scene]);
    const laid = autoLayout(nodes, edges);
    const market = laid.find((n) => n.id === "market_morning");
    expect(market?.position).toEqual({ x: 999, y: 888 });
  });
});

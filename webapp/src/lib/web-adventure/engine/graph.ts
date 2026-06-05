// graph.ts — Scene[] → ReactFlow nodes/edges 변환 + dagre 자동 레이아웃.
//
// #222 (6 주차) — /scenes/graph 편집 차트.
//
// 책임:
//   1. buildGraphFromScenes(scenes): Scene[] → { nodes, edges }
//      - 노드: scene 1 개당 노드 1 개. data 에 title/endingId/isStart/savedPosition.
//      - 엣지: choice 종류 별 매핑.
//        · plain → 1 edge (source → target, data.kind='plain')
//        · probability → 2 edges (success, failure / data.branch)
//        · conditional → 1 edge (data.kind='conditional', data.hidden=choice.hidden)
//   2. autoLayout(nodes, edges): position 없는 노드만 dagre TB 로 자동 배치.
//      - savedPosition 있는 노드는 그 좌표 유지.
//
// 외부 의존성:
//   - @dagrejs/dagre (3.x) — TB rank, nodesep=80, ranksep=120.

import dagre from "@dagrejs/dagre";
import type { Scene } from "@/types/web-adventure";

// position 필드는 Scene 타입에 아직 정식 추가되지 않았으므로 *확장 타입* 으로 받는다.
// mongo 문서는 그대로 통과 — 필드가 있으면 사용, 없으면 dagre 자동.
export type SceneWithPosition = Scene & {
  position?: { x: number; y: number };
};

export const START_SCENE_ID = "town_square_dawn";

export type GraphNodeData = {
  /** 표시 라벨 */
  title: string;
  /** 엔딩 여부 */
  isEnding?: boolean;
  /** 엔딩 ID (6 종) */
  endingId?: string;
  /** 시작 씬 여부 */
  isStart?: boolean;
  /** mongo 에 저장된 좌표 (있을 때만 — 자동 레이아웃 우회) */
  savedPosition?: { x: number; y: number };
};

export type GraphNode = {
  id: string;
  position: { x: number; y: number };
  data: GraphNodeData;
  /** ReactFlow 가 인식하는 옵션. */
  type?: string;
  draggable?: boolean;
};

export type GraphEdgeData = {
  /** 'plain' | 'probability' | 'conditional' */
  kind: "plain" | "probability" | "conditional";
  /** probability 의 경우 'success' | 'failure' */
  branch?: "success" | "failure";
  /** conditional 의 경우 hidden 여부 (UI 점선 표시 prop) */
  hidden?: boolean;
  /** 라벨 텍스트 (probability stat N% / conditional 조건 텍스트) */
  label?: string;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  data?: GraphEdgeData;
};

export function buildGraphFromScenes(
  scenes: SceneWithPosition[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = scenes.map((scene) => {
    const savedPosition = scene.position;
    const data: GraphNodeData = {
      title: scene.title,
    };
    if (scene.isEnding) data.isEnding = true;
    if (scene.endingId) data.endingId = scene.endingId;
    if (scene.id === START_SCENE_ID) data.isStart = true;
    if (savedPosition) data.savedPosition = savedPosition;
    return {
      id: scene.id,
      // 초기 placeholder — autoLayout 이 덮어쓴다. savedPosition 있으면 그대로.
      position: savedPosition ?? { x: 0, y: 0 },
      data,
    };
  });

  const edges: GraphEdge[] = [];
  for (const scene of scenes) {
    for (const choice of scene.choices ?? []) {
      if (choice.kind === "plain") {
        edges.push({
          id: `${scene.id}__${choice.id}__plain`,
          source: scene.id,
          target: choice.to,
          data: { kind: "plain", label: choice.label },
        });
      } else if (choice.kind === "probability") {
        edges.push({
          id: `${scene.id}__${choice.id}__success`,
          source: scene.id,
          target: choice.onSuccess,
          data: {
            kind: "probability",
            branch: "success",
            label: `${choice.stat} ${choice.difficulty}↑`,
          },
        });
        edges.push({
          id: `${scene.id}__${choice.id}__failure`,
          source: scene.id,
          target: choice.onFailure,
          data: {
            kind: "probability",
            branch: "failure",
            label: `${choice.stat} ${choice.difficulty}↓`,
          },
        });
      } else if (choice.kind === "conditional") {
        edges.push({
          id: `${scene.id}__${choice.id}__conditional`,
          source: scene.id,
          target: choice.to,
          data: {
            kind: "conditional",
            hidden: choice.hidden === true,
            label: choice.label,
          },
        });
      }
    }
  }

  return { nodes, edges };
}

/** dagre 자동 레이아웃. savedPosition 있는 노드는 그대로 유지. */
export function autoLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  opts?: { nodeWidth?: number; nodeHeight?: number },
): GraphNode[] {
  const nodeWidth = opts?.nodeWidth ?? 180;
  const nodeHeight = opts?.nodeHeight ?? 60;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 120 });

  for (const n of nodes) {
    g.setNode(n.id, { width: nodeWidth, height: nodeHeight });
  }
  for (const e of edges) {
    // dagre 가 인식 가능한 노드 간의 엣지만 추가 (target 미지정 dangling 방지).
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }
  dagre.layout(g);

  return nodes.map((n) => {
    if (n.data.savedPosition) {
      return { ...n, position: { ...n.data.savedPosition } };
    }
    const laid = g.node(n.id);
    const x = laid ? laid.x - nodeWidth / 2 : 0;
    const y = laid ? laid.y - nodeHeight / 2 : 0;
    return { ...n, position: { x, y } };
  });
}

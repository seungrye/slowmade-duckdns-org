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
//   2. autoLayout(nodes, edges): position 없는 노드만 dagre LR 로 자동 배치.
//      - savedPosition 있는 노드는 그 좌표 유지.
//
// 외부 의존성:
//   - @dagrejs/dagre (3.x) — LR rank, nodesep=80, ranksep=120.

import dagre from "@dagrejs/dagre";
import type { Scene } from "@/types/web-adventure";

// position 필드는 Scene 타입에 아직 정식 추가되지 않았으므로 *확장 타입* 으로 받는다.
// mongo 문서는 그대로 통과 — 필드가 있으면 사용, 없으면 dagre 자동.
export type SceneWithPosition = Scene & {
  position?: { x: number; y: number };
};

// #333 — 〈에테르니아〉 3 주인공 화이트리스트.
// 옛 사극 단일 시작 (town_square_dawn) 잔재 제거.
// content-lint 의 startSceneIds 와 일관.
export const START_SCENE_IDS = [
  "kael_infirmary",
  "rin_harbor",
  "solwen_grove",
] as const;

const START_SCENE_SET = new Set<string>(START_SCENE_IDS);

/**
 * 옛 단일 상수 호환 — 첫 시작 씬 (kael_infirmary) 을 가리킨다.
 * 신규 코드는 `START_SCENE_IDS` 또는 `isStartScene()` 사용.
 * @deprecated 2026-06 이후 제거 예정. START_SCENE_IDS 사용.
 */
export const START_SCENE_ID: (typeof START_SCENE_IDS)[number] = START_SCENE_IDS[0];

export function isStartScene(sceneId: string): boolean {
  return START_SCENE_SET.has(sceneId);
}

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
    if (isStartScene(scene.id)) data.isStart = true;
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
  // #344 — handle 이 Left(target)/Right(source) 로 변경됨에 따라 dagre 도 LR
  // 로 동기. 노드가 좌→우 흐름 + edge 자연스럽게 수평.
  g.setGraph({ rankdir: "LR", nodesep: 80, ranksep: 120 });

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

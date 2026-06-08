// graph.ts — Scene[] → ReactFlow nodes/edges 변환 + 자동 레이아웃.
//
// #222 (6 주차) — /scenes/graph 편집 차트.
// #347 — dagre → elkjs (더 빠른 layered layout).
//
// 책임:
//   1. buildGraphFromScenes(scenes): Scene[] → { nodes, edges }
//      - 노드: scene 1 개당 노드 1 개. data 에 title/endingId/isStart/savedPosition.
//      - 엣지: choice 종류 별 매핑.
//        · plain → 1 edge (source → target, data.kind='plain')
//        · probability → 2 edges (success, failure / data.branch)
//        · conditional → 1 edge (data.kind='conditional', data.hidden=choice.hidden)
//   2. autoLayout(nodes, edges) [async]: position 없는 노드만 elk LR 로 자동 배치.
//      - savedPosition 있는 노드는 그 좌표 유지.
//      - dagre 보다 *큰 그래프 (69 노드)* 에서 빠른 레이아웃 + 더 깔끔한 결과.
//
// 외부 의존성:
//   - elkjs (0.11+) — layered algorithm, LR direction.

// elkjs main entry — workerless. bundled (web worker) 는 vitest jsdom 환경에서
// worker 부재로 hang. main 은 동기 알고리즘 모두 포함.
import ELK from "elkjs";
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

/**
 * elk 자동 레이아웃 (async). savedPosition 있는 노드는 그대로 유지.
 * #347 — dagre → elkjs. layered algorithm + LR direction.
 */
export async function autoLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  opts?: { nodeWidth?: number; nodeHeight?: number },
): Promise<GraphNode[]> {
  const nodeWidth = opts?.nodeWidth ?? 180;
  const nodeHeight = opts?.nodeHeight ?? 60;

  // savedPosition 없는 노드만 layout 대상.
  const layoutTargets = nodes.filter((n) => !n.data.savedPosition);
  if (layoutTargets.length === 0) {
    // 모두 savedPosition — layout 호출 skip.
    return nodes.map((n) =>
      n.data.savedPosition
        ? { ...n, position: { ...n.data.savedPosition } }
        : n,
    );
  }

  const targetIds = new Set(layoutTargets.map((n) => n.id));
  const elk = new ELK();
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT", // LR
      "elk.spacing.nodeNode": "80",
      "elk.layered.spacing.nodeNodeBetweenLayers": "120",
    },
    children: layoutTargets.map((n) => ({
      id: n.id,
      width: nodeWidth,
      height: nodeHeight,
    })),
    edges: edges
      .filter((e) => targetIds.has(e.source) && targetIds.has(e.target))
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const result = await elk.layout(graph);
  const posMap = new Map<string, { x: number; y: number }>();
  for (const c of result.children ?? []) {
    if (c.id && typeof c.x === "number" && typeof c.y === "number") {
      posMap.set(c.id, { x: c.x, y: c.y });
    }
  }

  return nodes.map((n) => {
    if (n.data.savedPosition) {
      return { ...n, position: { ...n.data.savedPosition } };
    }
    const laid = posMap.get(n.id);
    return { ...n, position: laid ?? { x: 0, y: 0 } };
  });
}

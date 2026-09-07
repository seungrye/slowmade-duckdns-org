// graph.ts - converting Scene[] into ReactFlow nodes/edges plus the automatic layout.
//
// #222 (week 6) - the /scenes/graph editing chart.
// #347 - dagre -> elkjs (a faster layered layout).
//
// Responsibilities:
//   1. buildGraphFromScenes(scenes): Scene[] → { nodes, edges }
//      - nodes: one node per scene. data carries title/endingId/isStart/savedPosition.
//      - edges: mapped per choice kind.
//        · plain → 1 edge (source → target, data.kind='plain')
//        · probability → 2 edges (success, failure / data.branch)
//        · conditional → 1 edge (data.kind='conditional', data.hidden=choice.hidden)
//   2. autoLayout(nodes, edges) [async]: lays out only the nodes without a position, using elk LR.
//      - a node with a savedPosition keeps those coordinates.
//      - faster than dagre on *a large graph (69 nodes)* and a cleaner result.
//
// External dependencies:
//   - elkjs (0.11+) — layered algorithm, LR direction.

// The elkjs main entry - workerless. The bundled (web worker) build hangs under vitest's jsdom for want of a
// worker. main includes every synchronous algorithm.
import ELK from "elkjs";
import type { Scene } from "@/types/web-adventure";

// The position field is not formally on the Scene type yet, so it is taken through *an extended type*.
// A mongo document passes through as is - the field is used when present and dagre lays it out automatically otherwise.
export type SceneWithPosition = Scene & {
  position?: { x: number; y: number };
};

// #333 - the whitelist of Eternia's 3 protagonists.
// Removing the leftover single start (town_square_dawn) from the old historical-drama era.
// Consistent with content-lint's startSceneIds.
export const START_SCENE_IDS = [
  "kael_infirmary",
  "rin_harbor",
  "solwen_grove",
] as const;

const START_SCENE_SET = new Set<string>(START_SCENE_IDS);

/**
 * Compatibility with the old single constant - it points at the first starting scene (kael_infirmary).
 * New code uses `START_SCENE_IDS` or `isStartScene()`.
 * @deprecated to be removed after 2026-06. Use START_SCENE_IDS.
 */
export const START_SCENE_ID: (typeof START_SCENE_IDS)[number] = START_SCENE_IDS[0];

export function isStartScene(sceneId: string): boolean {
  return START_SCENE_SET.has(sceneId);
}

export type GraphNodeData = {
  /** The display label */
  title: string;
  /** Whether it is an ending */
  isEnding?: boolean;
  /** The ending ID (6 kinds) */
  endingId?: string;
  /** Whether it is a starting scene */
  isStart?: boolean;
  /** The coordinates stored in mongo (only when present - it bypasses the automatic layout) */
  savedPosition?: { x: number; y: number };
};

export type GraphNode = {
  id: string;
  position: { x: number; y: number };
  data: GraphNodeData;
  /** The options ReactFlow recognises. */
  type?: string;
  draggable?: boolean;
};

export type GraphEdgeData = {
  /** 'plain' | 'probability' | 'conditional' */
  kind: "plain" | "probability" | "conditional";
  /** For probability, 'success' | 'failure' */
  branch?: "success" | "failure";
  /** For conditional, whether it is hidden (the prop that draws it dashed in the UI) */
  hidden?: boolean;
  /** The label text (probability's stat N% / conditional's condition text) */
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
      // An initial placeholder - autoLayout overwrites it. A savedPosition is kept as is.
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
 * The elk automatic layout (async). Nodes with a savedPosition keep it.
 * #347 - dagre -> elkjs. The layered algorithm with LR direction.
 */
export async function autoLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  opts?: { nodeWidth?: number; nodeHeight?: number },
): Promise<GraphNode[]> {
  const nodeWidth = opts?.nodeWidth ?? 180;
  const nodeHeight = opts?.nodeHeight ?? 60;

  // Only nodes without a savedPosition are laid out.
  const layoutTargets = nodes.filter((n) => !n.data.savedPosition);
  if (layoutTargets.length === 0) {
    // all have a savedPosition - the layout call is skipped.
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

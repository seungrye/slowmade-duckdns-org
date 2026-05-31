import type { Node, Edge } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import type { QuestDocument, QuestPhaseDef } from "@/types/quest";
import type { PhaseNodeData } from "./phase-node";
import { transitionLabel } from "@/lib/condition-summary";

export function syncPhasePositions(
  phases: QuestDocument["phases"],
  updatedNodes: Node[]
): QuestDocument["phases"] {
  const result = { ...phases };
  for (const node of updatedNodes) {
    if (result[node.id]) {
      result[node.id] = { ...result[node.id], position: node.position } as QuestPhaseDef;
    }
  }
  return result;
}

/** 노드 폭/높이 추정 — dagre 가 간격 결정 시 사용. phase-node 의 실제 크기와 비슷. */
const NODE_W = 220;
const NODE_H = 90;

/**
 * 사용자가 저장한 position 이 *전혀 없는* phase 가 있으면 dagre 로 자동 배치한다.
 * 일부만 없는 경우엔 dagre 가 전부 다시 계산 — 기존 저장 position 은 그대로 두고
 * 누락된 것만 채우려면 별도 처리 필요(현 페이즈가 적어 전체 재배치도 무리 없음).
 *
 * 방향 'LR' (left → right) — 트랜지션 흐름이 가로축으로.
 */
function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return pos ? { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } } : n;
  });
}

export function buildGraph(quest: QuestDocument): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const phaseEntries = Object.entries(quest.phases);
  const allHavePosition =
    phaseEntries.length > 0 && phaseEntries.every(([, p]) => p.position !== undefined);
  const noneHavePosition = phaseEntries.every(([, p]) => p.position === undefined);
  for (const [phaseId, phase] of phaseEntries) {
    nodes.push({
      id: phaseId,
      type: "phase",
      position: phase.position ?? { x: 0, y: 0 },
      data: {
        phaseId,
        phase,
        isInitial: phaseId === quest.initialPhase,
        giverNpc: phaseId === quest.initialPhase ? quest.giverNpc : undefined,
      } satisfies PhaseNodeData,
    });
  }

  // transition 1개 = 엣지 1개. Interact 는 파랑, Auto 는 주황 점선.
  (quest.transitions ?? []).forEach((t, ti) => {
    if (!t.from || !t.to) return;
    const isAuto = t.trigger === "Auto";
    edges.push({
      id: `t${ti}:${t.from}→${t.to}`,
      source: t.from,
      target: t.to,
      label: transitionLabel(t.trigger, t.when),
      labelBgPadding: [4, 2],
      labelBgStyle: { fill: isAuto ? "#fff7ed" : "#eff6ff" },
      style: isAuto
        ? { stroke: "#f59e0b", strokeDasharray: "6 3" }
        : { stroke: "#3b82f6" },
      data: { edgeType: "transition", transitionIndex: ti },
      animated: isAuto,
    });
  });

  // 모두 position 있음 → 그대로.
  // 하나도 없음(첫 로드/import 직후) → dagre 로 트랜지션을 따라 LR 방향 트리/계층 자동 배치.
  // 일부만 없음(드래그 저장 후 새 phase 추가) → 기존 위치 보존, 누락 phase 만 우측 세로 배치.
  let finalNodes: Node[];
  if (allHavePosition) {
    finalNodes = nodes;
  } else if (noneHavePosition) {
    finalNodes = autoLayout(nodes, edges);
  } else {
    const known = nodes.filter((n) => quest.phases[n.id]?.position !== undefined);
    const maxX = known.length === 0 ? 0 : Math.max(...known.map((n) => n.position.x)) + 280;
    let unknownIdx = 0;
    finalNodes = nodes.map((n) => {
      if (quest.phases[n.id]?.position !== undefined) return n;
      const placed = { ...n, position: { x: maxX, y: unknownIdx * 140 } };
      unknownIdx++;
      return placed;
    });
  }
  return { nodes: finalNodes, edges };
}

import type { Node, Edge } from "@xyflow/react";
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

export function buildGraph(quest: QuestDocument): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let autoX = 0;

  for (const [phaseId, phase] of Object.entries(quest.phases)) {
    nodes.push({
      id: phaseId,
      type: "phase",
      position: phase.position ?? { x: autoX++ * 240, y: 0 },
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

  return { nodes, edges };
}

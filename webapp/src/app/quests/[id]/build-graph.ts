import type { Node, Edge } from "@xyflow/react";
import type { QuestDocument, Action } from "@/types/quest";
import type { PhaseNodeData } from "./phase-node";

function collectAdvanceTargets(actions: Action[]): string[] {
  const targets: string[] = [];
  for (const a of actions) {
    if (a.type === "AdvancePhase") targets.push(a.phaseId);
    if (a.type === "Branch") targets.push(...collectAdvanceTargets([...a.ifTrue, ...a.ifFalse]));
  }
  return targets;
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

    phase.on_interact.forEach((action, ai) => {
      if (action.type === "AdvancePhase") {
        edges.push({
          id: `${phaseId}→${action.phaseId}→interact→${ai}`,
          type: "smoothstep",
          source: phaseId,
          target: action.phaseId,
          label: "interact",
          style: { stroke: "#3b82f6" },
          data: { edgeType: "on_interact" },
          animated: false,
        });
      }
      if (action.type === "Branch") {
        collectAdvanceTargets([...action.ifTrue, ...action.ifFalse]).forEach((target, bi) => {
          edges.push({
            id: `${phaseId}→${target}→branch→${ai}→${bi}`,
            type: "smoothstep",
            source: phaseId,
            target,
            label: "branch",
            style: { stroke: "#f97316", strokeDasharray: "4 2" },
            data: { edgeType: "branch" },
            animated: false,
          });
        });
      }
    });

    phase.auto_advance.forEach((aa, aai) => {
      if (aa.nextPhase) {
        edges.push({
          id: `${phaseId}→${aa.nextPhase}→auto→${aai}`,
          type: "smoothstep",
          source: phaseId,
          target: aa.nextPhase,
          label: "auto",
          style: { stroke: "#f59e0b", strokeDasharray: "6 3" },
          data: { edgeType: "auto_advance", aaIndex: aai },
          animated: true,
        });
      }
    });
  }

  return { nodes, edges };
}

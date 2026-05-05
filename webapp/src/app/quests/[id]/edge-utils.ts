import type { Edge } from "@xyflow/react";

export function highlightEdges(edges: Edge[], selectedNodeId: string | null): Edge[] {
  if (!selectedNodeId) return edges;
  return edges.map((edge) => {
    if (edge.target === selectedNodeId)
      return { ...edge, style: { ...edge.style, stroke: "#3b82f6" } };
    if (edge.source === selectedNodeId)
      return { ...edge, style: { ...edge.style, stroke: "#ef4444" } };
    return { ...edge, style: { ...edge.style, stroke: "#f59e0b" } };
  });
}

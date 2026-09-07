// The edge style per branch kind (#278, weakening a hidden branch - a dimmed dashed line plus opacity).
// page.tsx cannot have a named export under Next's Page constraint -> a separate file.

import type { GraphEdge } from "@/lib/web-adventure/engine/graph";

export function edgeStyleForKind(data: GraphEdge["data"]): {
  stroke: string;
  strokeDasharray?: string;
  opacity?: number;
} {
  if (!data) return { stroke: "#6b7280" };
  if (data.kind === "plain") return { stroke: "#374151" };
  if (data.kind === "probability") {
    if (data.branch === "success") return { stroke: "#16a34a" };
    return { stroke: "#dc2626", strokeDasharray: "6 4" };
  }
  if (data.kind === "conditional") {
    return data.hidden
      ? { stroke: "#9ca3af", strokeDasharray: "4 3", opacity: 0.55 }
      : { stroke: "#2563eb" };
  }
  return { stroke: "#6b7280" };
}

// 분기 kind 별 edge 스타일 (#278 hidden 분기 약화 — dimmed 점선 + opacity).
// page.tsx 는 Next Page 제약으로 named export 불가 → 별도 파일.

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

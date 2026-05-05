import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/react";
import { highlightEdges } from "./edge-utils";

const edges: Edge[] = [
  { id: "a→b", source: "a", target: "b", style: { stroke: "#3b82f6" } },
  { id: "b→c", source: "b", target: "c", style: { stroke: "#3b82f6" } },
  { id: "x→y", source: "x", target: "y", style: { stroke: "#3b82f6" } },
];

describe("highlightEdges", () => {
  it("선택 없으면 원본 배열을 그대로 반환한다", () => {
    expect(highlightEdges(edges, null)).toBe(edges);
  });

  it("incoming 엣지(target === selected)를 파란색으로 변환한다", () => {
    const result = highlightEdges(edges, "b");
    expect(result.find((e) => e.id === "a→b")?.style?.stroke).toBe("#3b82f6");
  });

  it("outgoing 엣지(source === selected)를 빨간색으로 변환한다", () => {
    const result = highlightEdges(edges, "b");
    expect(result.find((e) => e.id === "b→c")?.style?.stroke).toBe("#ef4444");
  });

  it("무관한 엣지를 앰버색으로 변환한다", () => {
    const result = highlightEdges(edges, "b");
    expect(result.find((e) => e.id === "x→y")?.style?.stroke).toBe("#f59e0b");
  });
});

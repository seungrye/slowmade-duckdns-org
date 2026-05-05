// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhaseNode } from "./phase-node";
import type { PhaseNodeData } from "./phase-node";

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Top: "top", Bottom: "bottom" },
}));

import { vi } from "vitest";

const baseData: PhaseNodeData = {
  phaseId: "phase_start",
  phase: {
    dialog: ["안녕하세요"],
    on_interact: [{ type: "AdvancePhase", phaseId: "phase_next" }],
    auto_advance: [],
    objective: "목표 텍스트",
    position: { x: 0, y: 0 },
  },
  isInitial: false,
};

import type { NodeProps } from "@xyflow/react";

function renderNode(data: PhaseNodeData) {
  const props = { id: data.phaseId, data } as unknown as NodeProps;
  return render(<PhaseNode {...props} />);
}

describe("PhaseNode", () => {
  it("phaseId를 렌더한다", () => {
    renderNode(baseData);
    expect(screen.getByText("phase_start")).toBeTruthy();
  });

  it("objective를 렌더한다", () => {
    renderNode(baseData);
    expect(screen.getByText("목표 텍스트")).toBeTruthy();
  });

  it("dialog 첫 줄을 렌더한다", () => {
    renderNode(baseData);
    expect(screen.getByText(/안녕하세요/)).toBeTruthy();
  });

  it("on_interact 수를 렌더한다", () => {
    renderNode(baseData);
    expect(screen.getByText("액션 1")).toBeTruthy();
  });

  it("isInitial=true 이면 (시작) 표시를 렌더한다", () => {
    renderNode({ ...baseData, isInitial: true });
    expect(screen.getByText("(시작)")).toBeTruthy();
  });

  it("isInitial=false 이면 (시작) 표시가 없다", () => {
    renderNode({ ...baseData, isInitial: false });
    expect(screen.queryByText("(시작)")).toBeNull();
  });
});

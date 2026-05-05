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

function renderNode(data: PhaseNodeData, selected = false) {
  const props = { id: data.phaseId, data, selected } as unknown as NodeProps;
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

  it("isInitial=true이고 giverNpc가 있으면 NPC 뱃지를 렌더한다", () => {
    renderNode({ ...baseData, isInitial: true, giverNpc: "eddard_stark" });
    expect(screen.getByText("NPC: eddard_stark")).toBeTruthy();
  });

  it("isInitial=false이면 giverNpc가 있어도 NPC 뱃지가 없다", () => {
    renderNode({ ...baseData, isInitial: false, giverNpc: "eddard_stark" });
    expect(screen.queryByText("NPC: eddard_stark")).toBeNull();
  });

  it("selected=true이면 노란색 외곽선 클래스가 적용된다", () => {
    const { container } = renderNode(baseData, true);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("border-yellow-400");
    expect(root.className).toContain("ring-2");
  });

  it("selected=false이면 노란색 외곽선 클래스가 없다", () => {
    const { container } = renderNode(baseData, false);
    const root = container.firstChild as HTMLElement;
    expect(root.className).not.toContain("border-yellow-400");
  });

  it("isInitial=true이고 selected=true이면 노란색 외곽선이 파란색보다 우선한다", () => {
    const { container } = renderNode({ ...baseData, isInitial: true }, true);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("border-yellow-400");
    expect(root.className).not.toContain("border-blue-500");
  });
});

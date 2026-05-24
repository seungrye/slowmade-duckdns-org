// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Edge } from "@xyflow/react";
import { EdgePanel } from "./edge-panel";
import type { QuestTransition } from "@/types/quest";

const transitions: QuestTransition[] = [
  { from: "active", trigger: "Interact", actions: [], to: "ready" },
];

function makeEdge(): Edge {
  return {
    id: "t0:active→ready",
    source: "active",
    target: "ready",
    data: { edgeType: "transition", transitionIndex: 0 },
  } as Edge;
}

const baseProps = {
  edge: makeEdge(),
  transitions,
  phaseIds: ["active", "ready", "done"],
  onUpdateTransition: vi.fn(),
  onDeleteEdge: vi.fn(),
};

describe("EdgePanel — 뒤로 가기", () => {
  it("onBack 이 있으면 '← {from} 페이즈로' 버튼을 렌더하고 클릭 시 from 으로 호출", () => {
    const onBack = vi.fn();
    render(<EdgePanel {...baseProps} onBack={onBack} />);
    const back = screen.getByText(/페이즈로/);
    expect(back.textContent).toContain("active");
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledWith("active");
  });

  it("onBack 이 없으면 뒤로 가기 버튼이 없다", () => {
    render(<EdgePanel {...baseProps} />);
    expect(screen.queryByText(/페이즈로/)).toBeNull();
  });

  it("onClose 로 ✕ 닫기 버튼도 함께 제공된다", () => {
    const onClose = vi.fn();
    render(<EdgePanel {...baseProps} onClose={onClose} onBack={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("패널 닫기"));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("EdgePanel — 편집", () => {
  it("트리거/출발/도착 select 를 렌더한다", () => {
    render(<EdgePanel {...baseProps} />);
    const selects = screen.getAllByRole("combobox");
    // from, to, trigger 최소 3개
    expect(selects.length).toBeGreaterThanOrEqual(3);
  });

  it("연결 삭제 버튼이 onDeleteEdge(edge.id) 를 호출", () => {
    const onDeleteEdge = vi.fn();
    render(<EdgePanel {...baseProps} onDeleteEdge={onDeleteEdge} />);
    fireEvent.click(screen.getByText("연결 삭제"));
    expect(onDeleteEdge).toHaveBeenCalledWith("t0:active→ready");
  });

  it("transition 을 못 찾으면 안내 + 연결 삭제 가능", () => {
    const edge = { ...makeEdge(), data: { edgeType: "transition", transitionIndex: 99 } } as Edge;
    render(<EdgePanel {...baseProps} edge={edge} />);
    expect(screen.getByText(/찾을 수 없습니다/)).toBeTruthy();
  });
});

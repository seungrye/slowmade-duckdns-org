// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PhasePanel } from "./phase-panel";
import type { QuestPhaseDef, QuestTransition } from "@/types/quest";

const phase: QuestPhaseDef = {
  dialog: [],
  objective: null,
  position: { x: 0, y: 0 },
};

const baseProps = {
  phaseId: "phase_start",
  phase,
  giverNpc: "eddard_stark",
  onUpdate: vi.fn(),
  onUpdateGiverNpc: vi.fn(),
  onDelete: vi.fn(),
  onSetInitial: vi.fn(),
};

describe("PhasePanel — giverNpc", () => {
  it("isInitial=true이면 Giver NPC 입력 필드를 렌더한다", () => {
    render(<PhasePanel {...baseProps} isInitial={true} />);
    expect(screen.getByDisplayValue("eddard_stark")).toBeTruthy();
  });

  it("isInitial=false이면 Giver NPC 입력 필드가 없다", () => {
    render(<PhasePanel {...baseProps} isInitial={false} />);
    expect(screen.queryByDisplayValue("eddard_stark")).toBeNull();
  });

  it("Giver NPC 값 변경 시 onUpdateGiverNpc가 호출된다", () => {
    const onUpdateGiverNpc = vi.fn();
    render(<PhasePanel {...baseProps} isInitial={true} onUpdateGiverNpc={onUpdateGiverNpc} />);
    fireEvent.change(screen.getByDisplayValue("eddard_stark"), { target: { value: "jon_snow" } });
    expect(onUpdateGiverNpc).toHaveBeenCalledWith("jon_snow");
  });

  it("villagers 가 제공되면 datalist 옵션으로 노출된다", () => {
    const villagers = [
      { _id: '1', name: '장로', color: [0.9, 0.8, 0.5] as [number, number, number], dialogs: [], questId: 'gem_quest', speed: 0.5, version: 1, createdAt: '', updatedAt: '' },
    ];
    const { container } = render(<PhasePanel {...baseProps} isInitial={true} villagers={villagers} />);
    const opts = container.querySelectorAll("datalist option");
    expect(Array.from(opts).some((o) => (o as HTMLOptionElement).value === '장로')).toBe(true);
  });
});

describe("PhasePanel — 나가는 전환 목록", () => {
  const transitions: QuestTransition[] = [
    { from: "phase_start", trigger: "Interact", actions: [], to: "active" },
    { from: "phase_start", trigger: "Auto", when: { type: "HasItem", itemId: "eternal_gem" }, actions: [], to: "ready" },
    { from: "other", trigger: "Interact", actions: [], to: "x" },
  ];

  it("이 phase 에서 나가는 전환만 도착 phase + 조건과 함께 표시", () => {
    render(<PhasePanel {...baseProps} isInitial={false} transitions={transitions} />);
    expect(screen.getByText("나가는 전환 (2)")).toBeTruthy();
    expect(screen.getByText("active")).toBeTruthy();
    expect(screen.getByText("ready")).toBeTruthy();
    expect(screen.getByText("조건: 무조건")).toBeTruthy();
    expect(screen.getByText("조건: eternal_gem 보유")).toBeTruthy();
    // 다른 phase 의 전환(other→x)은 안 보임
    expect(screen.queryByText("x")).toBeNull();
  });

  it("나가는 전환 행 클릭 시 onEditTransition(index) 호출", () => {
    const onEditTransition = vi.fn();
    render(<PhasePanel {...baseProps} isInitial={false} transitions={transitions} onEditTransition={onEditTransition} />);
    fireEvent.click(screen.getByText("ready"));
    // transitions[1] 이 ready 로 가는 전환
    expect(onEditTransition).toHaveBeenCalledWith(1);
  });

  it("나가는 전환이 없으면 terminal 안내", () => {
    render(<PhasePanel {...baseProps} isInitial={false} transitions={[{ from: "other", trigger: "Interact", actions: [], to: "x" }]} />);
    expect(screen.getByText(/terminal/)).toBeTruthy();
  });
});

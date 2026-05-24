// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PhasePanel } from "./phase-panel";
import type { QuestPhaseDef } from "@/types/quest";

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

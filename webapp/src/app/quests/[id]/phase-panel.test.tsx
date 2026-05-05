// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PhasePanel } from "./phase-panel";
import type { QuestPhaseDef } from "@/types/quest";

const phase: QuestPhaseDef = {
  dialog: [],
  on_interact: [],
  auto_advance: [],
  objective: null,
  position: { x: 0, y: 0 },
};

const baseProps = {
  phaseId: "phase_start",
  phase,
  phaseIds: ["phase_start"],
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
});

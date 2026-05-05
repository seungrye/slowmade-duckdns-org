// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuestInfoPanel } from "./quest-info-panel";
import type { QuestDocument } from "@/types/quest";

const quest: QuestDocument = {
  _id: "abc123",
  id: "stark_quest",
  title: "스타크 퀘스트",
  giverNpc: "eddard_stark",
  initialPhase: "phase_start",
  phases: {},
  spawns: [],
  version: 1,
  createdAt: "",
  updatedAt: "",
};

describe("QuestInfoPanel", () => {
  it("title·id·giverNpc 필드를 렌더한다", () => {
    render(<QuestInfoPanel quest={quest} onUpdate={vi.fn()} />);
    expect((screen.getByDisplayValue("스타크 퀘스트") as HTMLInputElement).value).toBe("스타크 퀘스트");
    expect((screen.getByDisplayValue("stark_quest") as HTMLInputElement).value).toBe("stark_quest");
    expect((screen.getByDisplayValue("eddard_stark") as HTMLInputElement).value).toBe("eddard_stark");
  });

  it("title 변경 시 onUpdate가 { title } 로 호출된다", () => {
    const onUpdate = vi.fn();
    render(<QuestInfoPanel quest={quest} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByDisplayValue("스타크 퀘스트"), { target: { value: "새 제목" } });
    expect(onUpdate).toHaveBeenCalledWith({ title: "새 제목" });
  });

  it("id 변경 시 onUpdate가 { id } 로 호출된다", () => {
    const onUpdate = vi.fn();
    render(<QuestInfoPanel quest={quest} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByDisplayValue("stark_quest"), { target: { value: "new_quest" } });
    expect(onUpdate).toHaveBeenCalledWith({ id: "new_quest" });
  });

  it("giverNpc 변경 시 onUpdate가 { giverNpc } 로 호출된다", () => {
    const onUpdate = vi.fn();
    render(<QuestInfoPanel quest={quest} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByDisplayValue("eddard_stark"), { target: { value: "jon_snow" } });
    expect(onUpdate).toHaveBeenCalledWith({ giverNpc: "jon_snow" });
  });
});

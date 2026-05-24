import { describe, it, expect } from "vitest";
import { buildGraph, syncPhasePositions } from "./build-graph";
import type { QuestDocument } from "@/types/quest";

const quest: QuestDocument = {
  _id: "abc",
  id: "test_quest",
  title: "테스트",
  giverNpc: "npc_1",
  initialPhase: "phase_a",
  version: 1,
  createdAt: "",
  updatedAt: "",
  spawns: [],
  phases: {
    phase_a: {
      dialog: [],
      objective: null,
      position: { x: 0, y: 0 },
    },
    phase_b: {
      dialog: [],
      objective: null,
      position: { x: 240, y: 0 },
    },
  },
  transitions: [
    { from: "phase_a", trigger: "Interact", actions: [], to: "phase_b" },
    { from: "phase_a", trigger: "Auto", when: { type: "Always" }, actions: [], to: "phase_b" },
  ],
};

describe("buildGraph", () => {
  it("엣지가 생성된다", () => {
    const { edges } = buildGraph(quest);
    expect(edges.length).toBe(2);
  });

  it("시작 노드에 giverNpc가 설정된다", () => {
    const { nodes } = buildGraph(quest);
    const initial = nodes.find((n) => n.id === "phase_a");
    expect((initial?.data as { giverNpc?: string }).giverNpc).toBe("npc_1");
  });

  it("비시작 노드에는 giverNpc가 없다", () => {
    const { nodes } = buildGraph(quest);
    const other = nodes.find((n) => n.id === "phase_b");
    expect((other?.data as { giverNpc?: string }).giverNpc).toBeUndefined();
  });

  it("transition 마다 엣지를 생성하고 transitionIndex 를 부여한다", () => {
    const { edges } = buildGraph(quest);
    expect(edges.every((e) => (e.data as { edgeType: string }).edgeType === "transition")).toBe(true);
    expect(edges.map((e) => (e.data as { transitionIndex: number }).transitionIndex)).toEqual([0, 1]);
  });

  it("Interact 는 interact, Auto 는 auto 라벨", () => {
    const { edges } = buildGraph(quest);
    expect(edges[0].label).toBe("interact");
    expect(edges[1].label).toBe("auto");
  });
});

describe("syncPhasePositions", () => {
  it("여러 노드 위치를 한 번에 phases에 반영한다", () => {
    const phases = quest.phases;
    const updatedNodes = [
      { id: "phase_a", position: { x: 100, y: 200 } },
      { id: "phase_b", position: { x: 300, y: 400 } },
    ] as Parameters<typeof syncPhasePositions>[1];

    const result = syncPhasePositions(phases, updatedNodes);

    expect(result.phase_a.position).toEqual({ x: 100, y: 200 });
    expect(result.phase_b.position).toEqual({ x: 300, y: 400 });
  });

  it("원본 phases를 변경하지 않는다", () => {
    const phases = quest.phases;
    const updatedNodes = [
      { id: "phase_a", position: { x: 999, y: 999 } },
    ] as Parameters<typeof syncPhasePositions>[1];

    syncPhasePositions(phases, updatedNodes);

    expect(phases.phase_a.position).toEqual({ x: 0, y: 0 });
  });

  it("존재하지 않는 노드 id는 무시한다", () => {
    const phases = quest.phases;
    const updatedNodes = [
      { id: "nonexistent", position: { x: 50, y: 50 } },
    ] as Parameters<typeof syncPhasePositions>[1];

    const result = syncPhasePositions(phases, updatedNodes);

    expect(Object.keys(result)).toEqual(Object.keys(phases));
  });
});

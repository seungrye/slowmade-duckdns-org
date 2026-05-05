import { describe, it, expect } from "vitest";
import { buildGraph } from "./build-graph";
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
      on_interact: [{ type: "AdvancePhase", phaseId: "phase_b" }],
      auto_advance: [{ condition: { type: "Always" }, nextPhase: "phase_b" }],
      objective: null,
      position: { x: 0, y: 0 },
    },
    phase_b: {
      dialog: [],
      on_interact: [],
      auto_advance: [],
      objective: null,
      position: { x: 240, y: 0 },
    },
  },
};

describe("buildGraph", () => {
  it("엣지가 생성된다", () => {
    const { edges } = buildGraph(quest);
    expect(edges.length).toBeGreaterThan(0);
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

  it("on_interact AdvancePhase 엣지를 생성한다", () => {
    const { edges } = buildGraph(quest);
    expect(edges.some((e) => e.data && (e.data as { edgeType: string }).edgeType === "on_interact")).toBe(true);
  });

  it("auto_advance 엣지를 생성한다", () => {
    const { edges } = buildGraph(quest);
    expect(edges.some((e) => e.data && (e.data as { edgeType: string }).edgeType === "auto_advance")).toBe(true);
  });
});

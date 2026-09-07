// #270 - updating the legend and the sceneNode colour mapping to The Fall of Eternia's 6 endings.
// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import type * as React from "react";
import { render, screen } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => ({ get: () => null }),
}));

// Avoiding a ReactFlow mount - the nodes alone are rendered.
vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>("@xyflow/react");
  type Props = {
    nodes?: Array<{ id: string; type?: string; data?: Record<string, unknown> }>;
    nodeTypes?: Record<string, React.ComponentType<{ id: string; data: unknown }>>;
  };
  const Stub = (props: Props) => {
    const { nodes, nodeTypes } = props;
    return (
      <div className="react-flow">
        {(nodes ?? []).map((n) => {
          const Comp = n.type && nodeTypes ? nodeTypes[n.type] : undefined;
          return (
            <div key={n.id} className="react-flow__node">
              {Comp ? <Comp id={n.id} data={n.data} /> : null}
            </div>
          );
        })}
      </div>
    );
  };
  return {
    ...actual,
    ReactFlow: Stub,
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Handle: () => null,
    Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
    useReactFlow: () => ({
      fitView: vi.fn(),
      setNodes: vi.fn(),
      setEdges: vi.fn(),
      setCenter: vi.fn(),
      getZoom: () => 1,
      getNodes: () => [],
    }),
    useNodesState: () => [[], vi.fn(), vi.fn()],
    useEdgesState: () => [[], vi.fn(), vi.fn()],
  };
});

import GraphPage from "./page";
import SceneNode from "./sceneNode";

describe("#335 graph 범례 — 6 엔딩 라인 제거 + 엔딩 단일 색", () => {
  it("범례에 옛 6 엔딩 한글 라벨 부재 (시각 노이즈 제거)", () => {
    render(<GraphPage />);
    // The old 6 endings' individual lines - no longer shown.
    expect(screen.queryByText(/✨ 승천/)).toBeNull();
    expect(screen.queryByText(/⚙️ 혁명/)).toBeNull();
    expect(screen.queryByText(/☯ 조화/)).toBeNull();
    expect(screen.queryByText(/💀 추락/)).toBeNull();
    expect(screen.queryByText(/🗿 석화/)).toBeNull();
    expect(screen.queryByText(/🌿 정령의 결속/)).toBeNull();
    // The unified single line - "ending scene".
    expect(screen.getByText(/🏁 엔딩 씬/)).toBeInTheDocument();
  });

  // #337 - a selected node gets a *yellow glow* (box-shadow), not a *yellow ring*.
  it("selected=true sceneNode 는 box-shadow 노란 glow (ring-yellow 클래스 없음)", () => {
    const props = {
      id: "scene_x",
      data: { title: "테스트", savedPosition: false },
      selected: true,
      type: "scene",
      isConnectable: false,
      dragging: false,
      zIndex: 0,
    } as unknown as React.ComponentProps<typeof SceneNode>;
    const { container } = render(<SceneNode {...props} />);
    const node = container.querySelector(`[data-graph-node-id="scene_x"]`) as HTMLElement;
    expect(node).toBeTruthy();
    // no yellow ring class.
    expect(node.className).not.toMatch(/ring-yellow/);
    // a yellow box-shadow (an inline style) - the #fde047 (yellow-300) glow.
    expect(node.style.boxShadow).toMatch(/#fde047/i);
  });

  it("sceneNode 가 모든 엔딩에 *단일 색* (amber 계열) 매핑", () => {
    for (const id of ["ascension", "revolution", "harmony", "fall", "petrification", "sylvan_bond"] as const) {
      const props = {
        id: `ending_${id}`,
        data: { title: "테스트", isEnding: true, endingId: id, savedPosition: false },
        selected: false,
        type: "scene",
        isConnectable: false,
        dragging: false,
        zIndex: 0,
      } as unknown as React.ComponentProps<typeof SceneNode>;
      const { container, unmount } = render(<SceneNode {...props} />);
      const node = container.querySelector(`[data-graph-node-id="ending_${id}"]`);
      expect(node, `${id} 노드 렌더`).toBeTruthy();
      // not the ordinary node's grey fallback.
      expect(node?.className, `${id} 색 미매핑`).not.toMatch(/bg-gray-100/);
      // #335 - every ending is a single amber.
      expect(node?.className, `${id} 단일 amber 미매핑`).toMatch(/bg-amber-200/);
      unmount();
    }
  });
});

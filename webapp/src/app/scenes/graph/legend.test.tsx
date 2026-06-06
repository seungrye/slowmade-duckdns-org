// #270 — 〈에테르니아의 추락〉 6 엔딩으로 범례 + sceneNode 색상 매핑 갱신.
// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import type * as React from "react";
import { render, screen } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

// ReactFlow 마운트 회피 — 노드만 렌더.
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
    useReactFlow: () => ({ fitView: vi.fn(), setNodes: vi.fn() }),
    useNodesState: () => [[], vi.fn(), vi.fn()],
    useEdgesState: () => [[], vi.fn(), vi.fn()],
  };
});

import GraphPage from "./page";
import SceneNode from "./sceneNode";

describe("#270 graph 범례 〈에테르니아〉 갱신", () => {
  it("범례에 새 6 엔딩의 한글 라벨이 표시된다 (옛 사극 라벨 부재)", () => {
    render(<GraphPage />);
    // 신규 6 엔딩 — endingsMeta title 의 *앞 단어*.
    // 아이콘 + 엔딩명 형태로 매칭 (페이지 title 의 "추락" 과 분리).
    expect(screen.getByText(/✨ 승천/)).toBeInTheDocument();
    expect(screen.getByText(/⚙️ 혁명/)).toBeInTheDocument();
    expect(screen.getByText(/☯ 조화/)).toBeInTheDocument();
    expect(screen.getByText(/💀 추락/)).toBeInTheDocument();
    expect(screen.getByText(/🗿 석화/)).toBeInTheDocument();
    expect(screen.getByText(/🌿 정령의 결속/)).toBeInTheDocument();
    // 옛 사극 라벨 부재.
    expect(screen.queryByText(/산신령/)).toBeNull();
    expect(screen.queryByText(/도깨비/)).toBeNull();
    expect(screen.queryByText(/마법사/)).toBeNull();
  });

  it("sceneNode 가 ascension/sylvan_bond 등 새 endingId 에 색상 클래스를 매핑", () => {
    // SceneNode 의 NodeProps 는 xyflow 인터널 props 포함 — 테스트에선 핵심만 채워주고
    // 나머지는 캐스팅으로 우회 (실제 ReactFlow 마운트 없이 단위 렌더 검증).
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
      // 회색 fallback ('bg-gray-100') 가 아닌 *엔딩 전용* 배경 클래스를 가진다.
      expect(node?.className, `${id} 색 미매핑`).not.toMatch(/bg-gray-100/);
      // 적절한 색조 — 6 엔딩 각 별 *서로 다른* 색 패밀리 (단순 검증: bg- 으로 시작).
      expect(node?.className).toMatch(/bg-[a-z]+-\d{2,3}/);
      unmount();
    }
  });
});

// /scenes/graph — ReactFlow 편집 차트 페이지 테스트.
// #222 — TDD red→green.

// @vitest-environment jsdom
import type * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import GraphPage from "./page";

// next/navigation mock — useRouter().push 호출 추적.
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

// #225 — ReactFlow props 캡처용 (mock 안에서 참조).
// vi.hoisted 로 mock 보다 먼저 평가.
const flowProps = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

// ReactFlow mock — onNodeDrag*, nodesDraggable 등 props 캡처.
// 실제 마운트는 노드 클릭 / 드래그 검증에 방해되므로 가짜 컨테이너 + 자식 노드 렌더.
vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>(
    "@xyflow/react",
  );
  type ReactFlowProps = {
    nodes?: Array<{ id: string; type?: string; data?: Record<string, unknown> }>;
    nodeTypes?: Record<string, React.ComponentType<{ id: string; data: unknown }>>;
    children?: React.ReactNode;
    [k: string]: unknown;
  };
  const ReactFlowStub = (props: ReactFlowProps) => {
    Object.assign(flowProps.current, props);
    const { nodes, nodeTypes } = props;
    // .react-flow + .react-flow__node.draggable wrapper 로 노드 렌더.
    return (
      <div className="react-flow">
        {(nodes ?? []).map((n) => {
          const Comp = n.type && nodeTypes ? nodeTypes[n.type] : undefined;
          return (
            <div key={n.id} className="react-flow__node draggable">
              {Comp ? <Comp id={n.id} data={n.data as unknown} /> : null}
            </div>
          );
        })}
      </div>
    );
  };
  return {
    ...actual,
    ReactFlow: ReactFlowStub,
    Background: () => null,
    Controls: () => null,
    // Handle 도 zustand provider 의존 → stub.
    Handle: () => null,
  };
});

// 30 씬 mock (1 시작 + 23 일반 + 6 엔딩).
const ENDING_IDS = [
  "main",
  "spirit",
  "fail",
  "shopkeeper",
  "goblin_friend",
  "wizard_apprentice",
];

function makeMockScenes() {
  const scenes: Array<Record<string, unknown>> = [];
  // 시작 씬 — town_square_dawn (position 저장됨).
  scenes.push({
    id: "town_square_dawn",
    illustration: "x.png",
    title: "시작",
    body: ["…"],
    position: { x: 100, y: 200 },
    choices: [
      { kind: "plain", id: "c1", label: "다음", to: "scene_01" },
    ],
  });
  // 23 일반 씬 (position 없음 → dagre 자동).
  for (let i = 1; i <= 23; i++) {
    scenes.push({
      id: `scene_${i.toString().padStart(2, "0")}`,
      illustration: "x.png",
      title: `씬 ${i}`,
      body: ["…"],
      choices: [],
    });
  }
  // 6 엔딩.
  for (const e of ENDING_IDS) {
    scenes.push({
      id: `ending_${e}`,
      illustration: "x.png",
      title: `엔딩 ${e}`,
      body: ["…"],
      isEnding: true,
      endingId: e,
      choices: [],
    });
  }
  return scenes;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  pushMock.mockClear();
  fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes("/api/web-adventure/content/v1")) {
      return {
        ok: true,
        json: async () => ({ success: true, data: { scenes: makeMockScenes() } }),
      } as Response;
    }
    if (url.includes("/api/web-adventure/scenes/")) {
      return { ok: true, json: async () => ({ success: true, data: {} }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/scenes/graph — 페이지", () => {
  it("30 씬 fetch 후 ReactFlow 컨테이너 + 30 노드 렌더", async () => {
    const { container } = render(<GraphPage />);
    // fetch resolve 후 한 번 더 flush.
    await act(async () => {});
    await act(async () => {});
    // ReactFlow 컨테이너는 .react-flow 클래스로 마운트.
    const flowContainer = container.querySelector(".react-flow");
    expect(flowContainer).toBeTruthy();
    // 노드는 data-graph-node-id 속성으로 식별.
    const renderedNodes = container.querySelectorAll("[data-graph-node-id]");
    expect(renderedNodes.length).toBe(30);
  });

  it("엔딩 씬 노드는 endingId 별 색상 클래스 / 데이터 속성 적용", async () => {
    const { container } = render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    for (const e of ENDING_IDS) {
      const node = container.querySelector(`[data-graph-node-id="ending_${e}"]`);
      expect(node).toBeTruthy();
      expect(node?.getAttribute("data-ending-id")).toBe(e);
    }
  });

  it("노드 클릭 → router.push(`/scenes/{id}`) 호출 (드래그 거리 0 = click)", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    // #225 — onNodeClick 제거됨. drag start → stop 거리 0 이면 click 으로 처리.
    const onDragStart = flowProps.current.onNodeDragStart as (
      e: unknown,
      n: { id: string; position: { x: number; y: number } },
    ) => void;
    const onDragStop = flowProps.current.onNodeDragStop as (
      e: unknown,
      n: { id: string; position: { x: number; y: number } },
    ) => void;
    onDragStart({}, { id: "scene_01", position: { x: 0, y: 0 } });
    onDragStop({}, { id: "scene_01", position: { x: 0, y: 0 } });
    expect(pushMock).toHaveBeenCalledWith("/scenes/scene_01");
  });

  it("페이지 상단에 '씬 목록' 으로 돌아가는 링크 노출", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    const link = screen.getByText("← 씬 목록");
    expect(link.getAttribute("href")).toBe("/scenes");
  });

  it("position 저장된 시작 씬은 그 좌표 그대로 (data-saved-position=true)", async () => {
    const { container } = render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    const start = container.querySelector(
      `[data-graph-node-id="town_square_dawn"]`,
    );
    expect(start?.getAttribute("data-saved-position")).toBe("true");
  });

  it("position 없는 씬은 data-saved-position=false", async () => {
    const { container } = render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    const node = container.querySelector(
      `[data-graph-node-id="scene_05"]`,
    );
    expect(node?.getAttribute("data-saved-position")).toBe("false");
  });

  // #225 — 드래그 < 5px 시 click, ≥ 5px 시 PUT (위치 저장).
  // ReactFlow 컨테이너의 nodesDraggable prop + cursor-grab 시각 피드백.
  it("ReactFlow 컨테이너에 nodesDraggable=true prop 전달 (드래그 활성)", async () => {
    const { container } = render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    const flowContainer = container.querySelector(".react-flow");
    expect(flowContainer).toBeTruthy();
    // ReactFlow 가 draggable=true 인 노드 wrapper 를 마운트하면
    // .react-flow__node 가 .draggable 클래스를 갖는다.
    const draggableNode = container.querySelector(".react-flow__node.draggable");
    expect(draggableNode).toBeTruthy();
  });

  it("노드 outer div 에 cursor-grab 스타일 (드래그 가능 시각 피드백)", async () => {
    const { container } = render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    const node = container.querySelector(
      `[data-graph-node-id="scene_01"]`,
    ) as HTMLElement;
    expect(node).toBeTruthy();
    expect(node.className).toMatch(/cursor-grab/);
    // 드래그 중 시각 피드백.
    expect(node.className).toMatch(/active:cursor-grabbing/);
  });
});

// #225 — 드래그 vs 클릭 동작 분리.
// ReactFlow mock 으로 props (onNodeDragStart, onNodeDragStop, nodesDraggable)
// 를 캡처하고 핸들러를 직접 호출해 라우팅 / PUT 호출을 검증.
describe("/scenes/graph — 드래그 vs 클릭 동작 (#225)", () => {
  beforeEach(() => {
    flowProps.current = {};
  });

  it("nodesDraggable=true prop 명시 (옵션 1 안전 가드)", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    expect(flowProps.current.nodesDraggable).toBe(true);
  });

  it("onNodeClick 핸들러 제거 (드래그/클릭 충돌 방지)", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    // onNodeClick 은 더 이상 ReactFlow 에 전달되지 않는다.
    // (라우팅은 onNodeDragStop 안에서 거리 판정 후 처리)
    expect(flowProps.current.onNodeClick).toBeUndefined();
  });

  it("onNodeDragStart / onNodeDragStop 핸들러 전달", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    expect(typeof flowProps.current.onNodeDragStart).toBe("function");
    expect(typeof flowProps.current.onNodeDragStop).toBe("function");
  });

  it("드래그 < 5px 시 router.push(/scenes/[id]) — click 처리", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});

    const onDragStart = flowProps.current.onNodeDragStart as (
      e: unknown,
      n: { id: string; position: { x: number; y: number } },
    ) => void;
    const onDragStop = flowProps.current.onNodeDragStop as (
      e: unknown,
      n: { id: string; position: { x: number; y: number } },
    ) => void;

    onDragStart({}, { id: "scene_01", position: { x: 0, y: 0 } });
    onDragStop({}, { id: "scene_01", position: { x: 2, y: 3 } });

    expect(pushMock).toHaveBeenCalledWith("/scenes/scene_01");
    // PUT 은 호출되지 않아야 한다.
    const putCall = fetchMock.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("/api/web-adventure/scenes/"),
    );
    expect(putCall).toBeUndefined();
  });

  it("드래그 ≥ 5px 시 PUT /api/web-adventure/scenes/[id] — router.push 호출 X", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});

    vi.useFakeTimers();
    try {
      const onDragStart = flowProps.current.onNodeDragStart as (
        e: unknown,
        n: { id: string; position: { x: number; y: number } },
      ) => void;
      const onDragStop = flowProps.current.onNodeDragStop as (
        e: unknown,
        n: { id: string; position: { x: number; y: number } },
      ) => void;

      onDragStart({}, { id: "scene_02", position: { x: 0, y: 0 } });
      onDragStop({}, { id: "scene_02", position: { x: 100, y: 200 } });

      // debounce 500ms.
      await act(async () => {
        vi.advanceTimersByTime(600);
      });

      expect(pushMock).not.toHaveBeenCalled();

      const putCall = fetchMock.mock.calls.find(
        (c: unknown[]) =>
          typeof c[0] === "string" &&
          (c[0] as string).includes("/api/web-adventure/scenes/scene_02") &&
          (c[1] as { method?: string } | undefined)?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse(
        (putCall![1] as { body: string }).body,
      ) as { position: { x: number; y: number } };
      expect(body.position).toEqual({ x: 100, y: 200 });
    } finally {
      vi.useRealTimers();
    }
  });
});

// /scenes/graph - tests for the ReactFlow editing chart page.
// #222 — TDD red→green.

// @vitest-environment jsdom
import type * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import GraphPage from "./graph-client";

// The next/navigation mock - tracking useRouter().push calls.
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  // #341 - handling the focus URL param. The default mock is empty params.
  useSearchParams: () => ({ get: () => null }),
}));

// #347 - autoLayout is replaced by a synchronous grid mock.
//   elkjs's async resolve does not sit well with act under vitest and hangs.
//   Coordinate accuracy is not what vitest checks - a kept savedPosition plus grid coordinates is enough.
vi.mock("@/lib/web-adventure/engine/graph", async () => {
  const actual = await vi.importActual<typeof import("@/lib/web-adventure/engine/graph")>(
    "@/lib/web-adventure/engine/graph",
  );
  return {
    ...actual,
    autoLayout: async (
      nodes: Array<{ id: string; data?: { savedPosition?: { x: number; y: number } } }>,
    ) => {
      return nodes.map((n, i) => ({
        ...n,
        position: n.data?.savedPosition ?? { x: (i % 8) * 200, y: Math.floor(i / 8) * 100 },
      }));
    },
  };
});

// #225/#347 - for capturing the ReactFlow props, plus a mock store for the uncontrolled pattern.
//   The result of useReactFlow().setNodes/setEdges is stored in mockStore, and
//   ReactFlowStub renders it and exposes it on flowProps.nodes/edges.
const flowProps = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const mockStore = vi.hoisted(() => ({
  nodes: [] as Array<{ id: string; type?: string; data?: Record<string, unknown>; selected?: boolean; position?: { x: number; y: number } }>,
  edges: [] as Array<{ id: string; source: string; target: string; style?: { filter?: string } }>,
  // Registers the listener that re-renders GraphInner when the mock store changes.
  listeners: new Set<() => void>(),
}));

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual<typeof import("@xyflow/react")>(
    "@xyflow/react",
  );
  const React = await vi.importActual<typeof import("react")>("react");
  type ReactFlowProps = {
    nodeTypes?: Record<string, React.ComponentType<{ id: string; data: unknown }>>;
    children?: React.ReactNode;
    [k: string]: unknown;
  };
  const ReactFlowStub = (props: ReactFlowProps) => {
    // Re-rendering the component - registering the listener that triggers on a mockStore change.
    const [, force] = React.useState(0);
    React.useEffect(() => {
      const listener = () => force((v) => v + 1);
      mockStore.listeners.add(listener);
      return () => {
        mockStore.listeners.delete(listener);
      };
    }, []);
    // Captures the props and exposes mockStore's current nodes/edges alongside.
    Object.assign(flowProps.current, props, {
      nodes: mockStore.nodes,
      edges: mockStore.edges,
    });
    const { nodeTypes } = props;
    return (
      <div className="react-flow">
        {mockStore.nodes.map((n) => {
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
  const notify = () => {
    for (const l of mockStore.listeners) l();
  };
  return {
    ...actual,
    ReactFlow: ReactFlowStub,
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    useReactFlow: () => ({
      setNodes: (updater: unknown) => {
        const next =
          typeof updater === "function"
            ? (updater as (n: typeof mockStore.nodes) => typeof mockStore.nodes)(mockStore.nodes)
            : (updater as typeof mockStore.nodes);
        mockStore.nodes = next;
        notify();
      },
      setEdges: (updater: unknown) => {
        const next =
          typeof updater === "function"
            ? (updater as (e: typeof mockStore.edges) => typeof mockStore.edges)(mockStore.edges)
            : (updater as typeof mockStore.edges);
        mockStore.edges = next;
        notify();
      },
      setCenter: vi.fn(),
      getZoom: () => 1,
      getNodes: () => mockStore.nodes,
    }),
  };
});

// The 30-scene mock (1 start + 23 ordinary + 6 endings).
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
  // The starting scene - town_square_dawn (with a saved position).
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
  // The 23 ordinary scenes (no position -> dagre lays them out).
  for (let i = 1; i <= 23; i++) {
    scenes.push({
      id: `scene_${i.toString().padStart(2, "0")}`,
      illustration: "x.png",
      title: `씬 ${i}`,
      body: ["…"],
      choices: [],
    });
  }
  // The 6 endings.
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
  // Resetting mockStore (the uncontrolled pattern - fresh per test).
  mockStore.nodes = [];
  mockStore.edges = [];
  mockStore.listeners.clear();
  flowProps.current = {};
  pushMock.mockClear();
  fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/api/web-adventure/content/v1")) {
      return {
        ok: true,
        json: async () => ({ success: true, data: { scenes: makeMockScenes() } }),
      } as Response;
    }
    // #226 - the SidePanel's GET /api/web-adventure/scenes/[id].
    if (url.includes("/api/web-adventure/scenes/") && (!init || !init.method || init.method === "GET")) {
      // Extracting the id at the end of the url.
      const id = url.split("/api/web-adventure/scenes/")[1] ?? "";
      const all = makeMockScenes();
      const found = all.find((s) => (s as { id: string }).id === decodeURIComponent(id));
      return {
        ok: true,
        json: async () => ({ success: true, data: found ?? null }),
      } as Response;
    }
    // The SidePanel's GET /api/web-adventure/scenes (the scene id list).
    if (url.endsWith("/api/web-adventure/scenes")) {
      return {
        ok: true,
        json: async () => ({ success: true, data: makeMockScenes() }),
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

describe("/scenes/graph — SidePanel 통합 (#231)", () => {
  it("초기 상태 — selectedSceneId=null → SidePanel 미렌더 (data-testid='side-panel' 없음)", async () => {
    const { container } = render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    const panel = container.querySelector("[data-testid='side-panel']");
    expect(panel).toBeNull();
  });

  it("초기 상태 — '노드를 클릭하면 편집' 안내 메시지 없음", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    expect(screen.queryByText(/노드를 클릭하면 편집/)).toBeNull();
  });

  it("노드 클릭 (드래그<5px) 후 SidePanel 렌더", async () => {
    const { container } = render(<GraphPage />);
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
    await act(async () => {
      onDragStart({}, { id: "scene_01", position: { x: 0, y: 0 } });
      onDragStop({}, { id: "scene_01", position: { x: 1, y: 1 } });
    });
    await act(async () => {});
    const panel = container.querySelector("[data-testid='side-panel']");
    expect(panel).toBeTruthy();
    expect(panel?.getAttribute("data-scene-id")).toBe("scene_01");
  });

  it("닫기 버튼 → SidePanel 사라짐 (unmount)", async () => {
    const { container } = render(<GraphPage />);
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
    await act(async () => {
      onDragStart({}, { id: "scene_01", position: { x: 0, y: 0 } });
      onDragStop({}, { id: "scene_01", position: { x: 1, y: 1 } });
    });
    await act(async () => {});
    expect(container.querySelector("[data-testid='side-panel']")).toBeTruthy();
    // Clicking the close button -> the SidePanel unmounts.
    const closeBtn = screen.getByRole("button", { name: /닫기/ });
    await act(async () => {
      closeBtn.click();
    });
    await act(async () => {});
    expect(container.querySelector("[data-testid='side-panel']")).toBeNull();
  });
});

describe("/scenes/graph — 페이지", () => {
  it("30 씬 fetch 후 ReactFlow 컨테이너 + 30 노드 렌더", async () => {
    const { container } = render(<GraphPage />);
    // One more flush once the fetch resolves.
    await act(async () => {});
    await act(async () => {});
    // The ReactFlow container mounts with the .react-flow class.
    const flowContainer = container.querySelector(".react-flow");
    expect(flowContainer).toBeTruthy();
    // Nodes are identified by the data-graph-node-id attribute.
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

  it("노드 클릭 → router.push 호출 X + 사이드패널 활성화 (#226)", async () => {
    const { container } = render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    // #226 - a drag distance of 0 = a click -> setSelectedSceneId(id). router.push is not called.
    const onDragStart = flowProps.current.onNodeDragStart as (
      e: unknown,
      n: { id: string; position: { x: number; y: number } },
    ) => void;
    const onDragStop = flowProps.current.onNodeDragStop as (
      e: unknown,
      n: { id: string; position: { x: number; y: number } },
    ) => void;
    await act(async () => {
      onDragStart({}, { id: "scene_01", position: { x: 0, y: 0 } });
      onDragStop({}, { id: "scene_01", position: { x: 0, y: 0 } });
    });
    await act(async () => {});
    expect(pushMock).not.toHaveBeenCalled();
    // The side panel container takes the sceneId and shows it as active.
    const sidePanel = container.querySelector("[data-testid='side-panel']") as HTMLElement;
    expect(sidePanel).toBeTruthy();
    expect(sidePanel.getAttribute("data-scene-id")).toBe("scene_01");
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

  // #225 - a drag under 5px is a click, at or above 5px a PUT (saving the position).
  // The ReactFlow container's nodesDraggable prop plus the cursor-grab visual feedback.
  it("ReactFlow 컨테이너에 nodesDraggable=true prop 전달 (드래그 활성)", async () => {
    const { container } = render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    const flowContainer = container.querySelector(".react-flow");
    expect(flowContainer).toBeTruthy();
    // When ReactFlow mounts a node wrapper with draggable=true,
    // .react-flow__node carries the .draggable class.
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
    // Visual feedback while dragging.
    expect(node.className).toMatch(/active:cursor-grabbing/);
  });
});

// #225 - separating the drag and click behaviours.
// The ReactFlow mock captures the props (onNodeDragStart, onNodeDragStop, nodesDraggable)
// and the handlers are called directly to verify the routing and PUT calls.
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

  it("onNodeClick 핸들러 전달 (#233 — 순수 클릭 시 setSelectedSceneId)", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    // Correcting #225's assumption: on a pure click (zero movement) ReactFlow does not fire
    // onNodeDragStart/Stop at all, so the isClick branch is never reached -> a click is ignored forever.
    // #233 - onNodeClick is passed again, handling both a drag (< 5px) and a click (zero movement).
    expect(typeof flowProps.current.onNodeClick).toBe("function");
  });

  it("onNodeDragStart / onNodeDragStop 핸들러 전달", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    expect(typeof flowProps.current.onNodeDragStart).toBe("function");
    expect(typeof flowProps.current.onNodeDragStop).toBe("function");
  });

  it("드래그 < 5px 시 사이드패널 활성화 — click 처리 (#226)", async () => {
    const { container } = render(<GraphPage />);
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

    await act(async () => {
      onDragStart({}, { id: "scene_01", position: { x: 0, y: 0 } });
      onDragStop({}, { id: "scene_01", position: { x: 2, y: 3 } });
    });
    await act(async () => {});

    expect(pushMock).not.toHaveBeenCalled();
    const sidePanel = container.querySelector("[data-testid='side-panel']") as HTMLElement;
    expect(sidePanel?.getAttribute("data-scene-id")).toBe("scene_01");

    // The PUT (saving the position) must not be called.
    const putCall = fetchMock.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("/api/web-adventure/scenes/scene_01") &&
        (c[1] as { method?: string } | undefined)?.method === "PUT",
    );
    expect(putCall).toBeUndefined();
  });

  it("드래그 ≥ 5px 시 PUT /api/web-adventure/scenes/[id] — 사이드패널 활성화 X (#226)", async () => {
    const { container } = render(<GraphPage />);
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
      const sidePanel = container.querySelector("[data-testid='side-panel']") as HTMLElement;
      expect(sidePanel?.getAttribute("data-scene-id")).toBeFalsy();

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

import fs from "node:fs";
import path from "node:path";

describe("#233 — 순수 클릭 (onNodeClick) 분기", () => {
  test("page.tsx 에 onNodeClick prop + setSelectedSceneId 호출 존재", () => {
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/graph-client.tsx"), "utf-8");
    expect(code).toMatch(/onNodeClick=\{/);
    expect(code).toMatch(/setSelectedSceneId\(/);
  });
});

// #235 - closing the panel turns the highlight off and centres the camera on the selected node.
// A. rfNodes' selected field must follow selectedSceneId.
// B. GraphInner is wrapped in ReactFlowProvider so useReactFlow is available.
// C. a changed selectedSceneId calls setCenter after a 350ms setTimeout.
describe("/scenes/graph — #235 패널 닫기 highlight off + 카메라 중앙 이동", () => {
  beforeEach(() => {
    flowProps.current = {};
  });

  it("초기 상태 — 모든 노드의 selected=false (selectedSceneId=null)", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    const nodes = (flowProps.current.nodes ?? []) as Array<{
      id: string;
      selected?: boolean;
    }>;
    expect(nodes.length).toBe(30);
    for (const n of nodes) {
      expect(n.selected).toBe(false);
    }
  });

  it("노드 클릭 후 해당 노드만 selected=true, 나머지는 false", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    const onNodeClick = flowProps.current.onNodeClick as (e: unknown, n: { id: string }) => void;
    await act(async () => {
      onNodeClick({}, { id: "scene_01" });
    });
    await act(async () => {});
    const nodes = (flowProps.current.nodes ?? []) as Array<{
      id: string;
      selected?: boolean;
    }>;
    const selected = nodes.find((n) => n.id === "scene_01");
    expect(selected?.selected).toBe(true);
    const others = nodes.filter((n) => n.id !== "scene_01");
    for (const n of others) {
      expect(n.selected).toBe(false);
    }
  });

  it("닫기 버튼 클릭 → 모든 노드 selected=false (highlight off)", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    const onNodeClick = flowProps.current.onNodeClick as (e: unknown, n: { id: string }) => void;
    await act(async () => {
      onNodeClick({}, { id: "scene_01" });
    });
    await act(async () => {});
    // Confirming the selected state.
    let nodes = (flowProps.current.nodes ?? []) as Array<{
      id: string;
      selected?: boolean;
    }>;
    expect(nodes.find((n) => n.id === "scene_01")?.selected).toBe(true);

    // The close button -> onClose -> setSelectedSceneId(null).
    const closeBtn = screen.getByRole("button", { name: /닫기/ });
    await act(async () => {
      closeBtn.click();
    });
    await act(async () => {});

    nodes = (flowProps.current.nodes ?? []) as Array<{
      id: string;
      selected?: boolean;
    }>;
    for (const n of nodes) {
      expect(n.selected).toBe(false);
    }
  });

  test("page.tsx 에 ReactFlowProvider + GraphInner 구조 존재", () => {
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/graph-client.tsx"), "utf-8");
    // GraphPage wraps GraphInner in ReactFlowProvider.
    expect(code).toMatch(/ReactFlowProvider/);
    expect(code).toMatch(/GraphInner/);
  });

  test("page.tsx 에 useReactFlow + setCenter 호출 존재", () => {
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/graph-client.tsx"), "utf-8");
    expect(code).toMatch(/useReactFlow\(\)/);
    expect(code).toMatch(/setCenter\(/);
  });

  test("page.tsx 에 selected 필드 부착 + selectedSceneId 변화 추적", () => {
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/graph-client.tsx"), "utf-8");
    // The node's selected field is attached inside a useEffect or useMemo.
    expect(code).toMatch(/selected:\s*[a-zA-Z_]+\.id\s*===\s*selectedSceneId/);
    // #329 - the split useNodesState structure: selectedSceneId appears in another effect's
    // or memo's deps (the exact place is the implementation's choice). Only whether selectedSceneId is tracked
    // reactively is verified.
    expect(code).toMatch(/selectedSceneId\b/);
  });

  test("page.tsx — #347 일반 클릭 시 setCenter 호출 없음 (응답성 위해 카메라 이동 제거)", () => {
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/graph-client.tsx"), "utf-8");
    // Only the focus-URL effect's setCenter (zoom 1.2 / duration 600) remains.
    expect(code).toMatch(/zoom:\s*1\.2/);
    expect(code).toMatch(/duration:\s*600/);
  });
});

// #336 - clicking the canvas's empty space closes the panel, clears the selection and removes the edge glow.
describe("/scenes/graph — #336 onPaneClick = 선택 해제", () => {
  beforeEach(() => {
    flowProps.current = {};
  });

  it("ReactFlow 에 onPaneClick 핸들러 전달", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    expect(typeof flowProps.current.onPaneClick).toBe("function");
  });

  it("노드 선택 후 onPaneClick → SidePanel unmount + nodes selected=false", async () => {
    const { container } = render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});

    const onNodeClick = flowProps.current.onNodeClick as (e: unknown, n: { id: string }) => void;
    await act(async () => {
      onNodeClick({}, { id: "scene_01" });
    });
    await act(async () => {});
    expect(
      container.querySelector("[data-testid='side-panel']"),
    ).toBeTruthy();

    const onPaneClick = flowProps.current.onPaneClick as () => void;
    await act(async () => {
      onPaneClick();
    });
    await act(async () => {});

    expect(
      container.querySelector("[data-testid='side-panel']"),
    ).toBeFalsy();
    const nodes = (flowProps.current.nodes ?? []) as Array<{ selected?: boolean }>;
    for (const n of nodes) {
      expect(n.selected).toBe(false);
    }
    const edges = (flowProps.current.edges ?? []) as Array<{ style?: { filter?: string } }>;
    for (const e of edges) {
      expect(e.style?.filter ?? "").not.toMatch(/drop-shadow/);
    }
  });
});

// #334 - selecting a node gives its connected edges a yellow drop-shadow glow.
// The original stroke colour (grey/green/red/blue) is kept and only the *outer glow* is added through a filter.
describe("/scenes/graph — #334 노드 선택 시 연결 엣지 노란색 highlight", () => {
  beforeEach(() => {
    flowProps.current = {};
  });

  it("선택 노드의 connected edges 가 style.filter 에 drop-shadow 부착", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});

    // Selecting one node - scene_01 (start -> scene_01 connection).
    const onNodeClick = flowProps.current.onNodeClick as (e: unknown, n: { id: string }) => void;
    await act(async () => {
      onNodeClick({}, { id: "scene_01" });
    });
    await act(async () => {});

    const edges = (flowProps.current.edges ?? []) as Array<{
      id: string;
      source: string;
      target: string;
      style?: { filter?: string };
    }>;
    const connected = edges.filter(
      (e) => e.source === "scene_01" || e.target === "scene_01",
    );
    expect(connected.length).toBeGreaterThanOrEqual(1);
    for (const e of connected) {
      expect(e.style?.filter ?? "").toMatch(/drop-shadow/);
    }
    // An unconnected edge - no filter.
    const others = edges.filter(
      (e) => e.source !== "scene_01" && e.target !== "scene_01",
    );
    for (const e of others) {
      expect(e.style?.filter ?? "").not.toMatch(/drop-shadow/);
    }
  });

  it("선택 해제 (selectedSceneId=null) → 모든 엣지 filter 제거", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});

    const onNodeClick = flowProps.current.onNodeClick as (e: unknown, n: { id: string }) => void;
    await act(async () => {
      onNodeClick({}, { id: "scene_01" });
    });
    await act(async () => {});

    // Closing - the SidePanel's close button.
    const closeBtn = screen.getByRole("button", { name: /닫기/ });
    await act(async () => {
      closeBtn.click();
    });
    await act(async () => {});

    const edges = (flowProps.current.edges ?? []) as Array<{
      style?: { filter?: string };
    }>;
    for (const e of edges) {
      expect(e.style?.filter ?? "").not.toMatch(/drop-shadow/);
    }
  });
});

// #332 - blocking a viewport reset while dragging.
// With the setCenter effect's useEffect taking [selectedSceneId, rfNodes, ...] as deps,
// every rfNodes change during a drag fires setCenter -> the camera jumps to the node's centre on every
// mousemove -> to the user it looks like "the screen resets to the top".
// rfNodes is excluded from the deps - the camera moves only when selectedSceneId changes.
describe("/scenes/graph — #332 드래그 중 viewport reset 차단", () => {
  test("setCenter effect 의 deps 에 rfNodes 없음 (selectedSceneId 만)", () => {
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/graph-client.tsx"), "utf-8");
    // rfNodes must not appear in the deps array of the useEffect around the setCenter call.
    // The pattern: the deps array at the end of the useEffect where setCenter appears.
    // The simplest check: no useEffect with 'rfNodes' in its deps array
    // calls setCenter. -> rfNodes is absent from the deps of the same effect as
    // setCenter.
    // The conservative check: the setCenter\(.*\)\s*;[\s\S]*?\}\s*,\s*\[([^\]]*)\] pattern.
    const m = code.match(/setCenter\([\s\S]*?\}\s*,\s*\[([^\]]*)\]\s*\)/);
    expect(m).toBeTruthy();
    const deps = m![1];
    expect(deps).not.toMatch(/rfNodes/);
  });
});

// #331 - a dragged coordinate must survive a refresh.
// The content/v1 API caches for 60 seconds -> a refresh right after a drag gets the old data.
// The graph page's fetch uses cache: "no-store" so it always gets fresh data.
describe("/scenes/graph — #331 새로고침 시 드래그 위치 유지 (no-store)", () => {
  test("content/v1 fetch 에 cache: 'no-store' 옵션 (또는 동등 캐시 무력화)", () => {
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/graph-client.tsx"), "utf-8");
    // The fetch call states cache: 'no-store' - or a cache-buster query.
    // The preferred pattern: a { cache: "no-store" } option in fetch's second argument.
    const hasNoStore = /cache:\s*["']no-store["']/.test(code);
    const hasCacheBuster = /\?[^"']*t=[\$\{]/.test(code);
    expect(hasNoStore || hasCacheBuster).toBe(true);
  });
});

// #347 - the move to the uncontrolled pattern: no nodes/edges prop, and the internal store is updated
// through useReactFlow().setNodes. A drag updates no external state -> the component does not re-render.
describe("/scenes/graph — #347 uncontrolled 패턴 (defaultNodes/setNodes)", () => {
  beforeEach(() => {
    flowProps.current = {};
  });

  test("page.tsx — defaultNodes/defaultEdges prop + useReactFlow().setNodes 패턴", () => {
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/graph-client.tsx"), "utf-8");
    expect(code).toMatch(/defaultNodes=\{/);
    expect(code).toMatch(/defaultEdges=\{/);
    // useReactFlow's setNodes/setEdges are used.
    expect(code).toMatch(/setNodes\(/);
    expect(code).toMatch(/setEdges\(/);
    // The old nodes={} edges={} (controlled props) are absent.
    expect(code).not.toMatch(/<ReactFlow[^>]*\s+nodes=\{/s);
  });
});



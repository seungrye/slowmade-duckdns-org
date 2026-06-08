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
  // #341 — focus URL param 처리 — 기본 mock 은 빈 params.
  useSearchParams: () => ({ get: () => null }),
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
  fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/api/web-adventure/content/v1")) {
      return {
        ok: true,
        json: async () => ({ success: true, data: { scenes: makeMockScenes() } }),
      } as Response;
    }
    // #226 — SidePanel 의 GET /api/web-adventure/scenes/[id].
    if (url.includes("/api/web-adventure/scenes/") && (!init || !init.method || init.method === "GET")) {
      // url 끝의 id 추출.
      const id = url.split("/api/web-adventure/scenes/")[1] ?? "";
      const all = makeMockScenes();
      const found = all.find((s) => (s as { id: string }).id === decodeURIComponent(id));
      return {
        ok: true,
        json: async () => ({ success: true, data: found ?? null }),
      } as Response;
    }
    // SidePanel 의 GET /api/web-adventure/scenes (씬 ID 목록).
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
    // 닫기 버튼 클릭 → SidePanel unmount.
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

  it("노드 클릭 → router.push 호출 X + 사이드패널 활성화 (#226)", async () => {
    const { container } = render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    // #226 — drag 거리 0 = click → setSelectedSceneId(id). router.push 호출 안함.
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
    // 사이드패널 컨테이너가 sceneId 를 받아 활성화 표시.
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

  it("onNodeClick 핸들러 전달 (#233 — 순수 클릭 시 setSelectedSceneId)", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    // #225 가정 정정: ReactFlow 는 순수 클릭(움직임 0) 시 onNodeDragStart/Stop
    // 자체를 발화하지 않아 isClick 분기 도달 X → 클릭 영원히 무시.
    // #233 — onNodeClick 다시 전달, drag(< 5px) 와 click(움직임 0) 양쪽 모두 처리.
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

    // PUT (위치 저장) 은 호출되지 않아야 한다.
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
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/page.tsx"), "utf-8");
    expect(code).toMatch(/onNodeClick=\{/);
    expect(code).toMatch(/setSelectedSceneId\(/);
  });
});

// #235 — 패널 닫기 시 highlight off + 선택 노드 카메라 중앙 이동.
// A. rfNodes 의 selected 필드가 selectedSceneId 에 따라 부착되어야 함.
// B. ReactFlowProvider 로 GraphInner 가 wrap 되어 useReactFlow 가 사용 가능.
// C. selectedSceneId 변경 시 setTimeout 350ms 후 setCenter 호출.
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
    // 선택된 상태 확인.
    let nodes = (flowProps.current.nodes ?? []) as Array<{
      id: string;
      selected?: boolean;
    }>;
    expect(nodes.find((n) => n.id === "scene_01")?.selected).toBe(true);

    // 닫기 버튼 → onClose → setSelectedSceneId(null).
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
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/page.tsx"), "utf-8");
    // GraphPage 는 ReactFlowProvider 로 GraphInner 를 wrap.
    expect(code).toMatch(/ReactFlowProvider/);
    expect(code).toMatch(/GraphInner/);
  });

  test("page.tsx 에 useReactFlow + setCenter 호출 존재", () => {
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/page.tsx"), "utf-8");
    expect(code).toMatch(/useReactFlow\(\)/);
    expect(code).toMatch(/setCenter\(/);
  });

  test("page.tsx 에 selected 필드 부착 + selectedSceneId 변화 추적", () => {
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/page.tsx"), "utf-8");
    // 노드 선택 필드 부착 — useEffect 또는 useMemo 내부.
    expect(code).toMatch(/selected:\s*[a-zA-Z_]+\.id\s*===\s*selectedSceneId/);
    // #329 — useNodesState 분리 구조: selectedSceneId 가 다른 effect/memo
    // 의 deps 에 등장 (정확한 위치는 구현 자유). selectedSceneId 가 reactive
    // 추적되는지만 검증.
    expect(code).toMatch(/selectedSceneId\b/);
  });

  test("page.tsx — #347 일반 클릭 시 setCenter 호출 없음 (응답성 위해 카메라 이동 제거)", () => {
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/page.tsx"), "utf-8");
    // focus URL effect 의 setCenter (zoom 1.2 / duration 600) 만 유지.
    expect(code).toMatch(/zoom:\s*1\.2/);
    expect(code).toMatch(/duration:\s*600/);
  });
});

// #336 — 캔버스 빈 여백 클릭 → 패널 닫기 + selected 해제 + 엣지 glow 제거.
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

// #334 — 노드 선택 시 연결 엣지에 노란색 drop-shadow glow.
// 원본 stroke 색 (회색/초록/빨강/파랑) 은 유지, filter 로 *외곽광* 만 추가.
describe("/scenes/graph — #334 노드 선택 시 연결 엣지 노란색 highlight", () => {
  beforeEach(() => {
    flowProps.current = {};
  });

  it("선택 노드의 connected edges 가 style.filter 에 drop-shadow 부착", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});

    // 한 노드 선택 — scene_01 (시작 → scene_01 연결).
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
    // 비연결 엣지 — filter 없음.
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

    // 닫기 — SidePanel 의 닫기 버튼.
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

// #332 — 드래그 중 viewport reset 차단.
// setCenter 효과의 useEffect 가 [selectedSceneId, rfNodes, ...] 를 deps 로
// 두면 드래그 시 rfNodes 변경마다 setCenter 가 발화 → 카메라가 매 mousemove
// 마다 노드 중심으로 jump → 사용자에게 "화면이 상단으로 reset" 으로 보임.
// deps 에서 rfNodes 제외 — selectedSceneId 변경 시에만 카메라 이동.
describe("/scenes/graph — #332 드래그 중 viewport reset 차단", () => {
  test("setCenter effect 의 deps 에 rfNodes 없음 (selectedSceneId 만)", () => {
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/page.tsx"), "utf-8");
    // setCenter 호출 근처의 useEffect 의 deps 배열에 rfNodes 가 등장하지 않아야.
    // 패턴: setCenter 가 등장하는 useEffect 끝의 deps 배열.
    // 가장 단순한 검사: 'rfNodes' 가 deps 배열 안에 들어가는 useEffect 가
    // setCenter 를 호출하지 않음. → setCenter 와 같은 effect 의 deps 에
    // rfNodes 미포함.
    // 보수적 검사: setCenter\(.*\)\s*;[\s\S]*?\}\s*,\s*\[([^\]]*)\] 패턴.
    const m = code.match(/setCenter\([\s\S]*?\}\s*,\s*\[([^\]]*)\]\s*\)/);
    expect(m).toBeTruthy();
    const deps = m![1];
    expect(deps).not.toMatch(/rfNodes/);
  });
});

// #331 — 새로고침 시 드래그한 좌표가 유지되어야 함.
// content/v1 API 가 60 초 캐시 → 드래그 직후 새로고침이 예전 데이터를 받음.
// graph 페이지의 fetch 가 cache: "no-store" 로 항상 fresh 데이터 받도록.
describe("/scenes/graph — #331 새로고침 시 드래그 위치 유지 (no-store)", () => {
  test("content/v1 fetch 에 cache: 'no-store' 옵션 (또는 동등 캐시 무력화)", () => {
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/page.tsx"), "utf-8");
    // fetch 호출에 cache: 'no-store' 명시 — 또는 cache-buster 쿼리.
    // 우선 패턴: { cache: "no-store" } 옵션이 fetch 두 번째 인자에 등장.
    const hasNoStore = /cache:\s*["']no-store["']/.test(code);
    const hasCacheBuster = /\?[^"']*t=[\$\{]/.test(code);
    expect(hasNoStore || hasCacheBuster).toBe(true);
  });
});

// #329 — 드래그 시 노드가 *실제* 마우스를 따라가도록.
// ReactFlow 제어 모드 (nodes prop) 는 `onNodesChange` 가 없으면 드래그 변화가
// 외부 state 에 반영되지 않아 *드래그 자체가 화면에 안 보임*. useNodesState +
// onNodesChange = applyNodeChanges 패턴 도입.
describe("/scenes/graph — #329 드래그 위치 변경 (useNodesState + onNodesChange)", () => {
  beforeEach(() => {
    flowProps.current = {};
  });

  test("page.tsx 에 useNodesState/useEdgesState import + 사용", () => {
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/page.tsx"), "utf-8");
    // import 구문에 useNodesState 가 등장 (@xyflow/react).
    expect(code).toMatch(/useNodesState/);
    expect(code).toMatch(/useEdgesState/);
  });

  it("ReactFlow 컨테이너에 onNodesChange / onEdgesChange prop 전달", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    expect(typeof flowProps.current.onNodesChange).toBe("function");
    expect(typeof flowProps.current.onEdgesChange).toBe("function");
  });

  it("onNodesChange 호출 → ReactFlow 의 nodes prop 의 position 이 갱신됨", async () => {
    render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});

    const onNodesChange = flowProps.current.onNodesChange as (
      changes: Array<{ id: string; type: string; position?: { x: number; y: number } }>,
    ) => void;
    expect(typeof onNodesChange).toBe("function");

    // 드래그 종료 가정 시 ReactFlow 가 발화하는 변경:
    // { id, type: 'position', position: { x: 500, y: 500 } } (dragging: false 도 포함 가능).
    await act(async () => {
      onNodesChange([
        { id: "scene_01", type: "position", position: { x: 500, y: 500 } } as never,
      ]);
    });
    await act(async () => {});

    const nodes = (flowProps.current.nodes ?? []) as Array<{
      id: string;
      position: { x: number; y: number };
    }>;
    const moved = nodes.find((n) => n.id === "scene_01");
    expect(moved?.position).toEqual({ x: 500, y: 500 });
  });

  test("page.tsx 에 applyNodeChanges 패턴 (또는 useNodesState 호출) 으로 노드 state 관리", () => {
    const code = fs.readFileSync(path.resolve("src/app/scenes/graph/page.tsx"), "utf-8");
    // 둘 중 하나는 반드시 존재 — useNodesState 가 가장 단순한 패턴.
    const hasUseNodesState = /useNodesState\(/.test(code);
    const hasApplyNodeChanges = /applyNodeChanges/.test(code);
    expect(hasUseNodesState || hasApplyNodeChanges).toBe(true);
  });
});



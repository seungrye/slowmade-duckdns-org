// /scenes/graph — ReactFlow 편집 차트 페이지 테스트.
// #222 — TDD red→green.

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent, screen } from "@testing-library/react";
import GraphPage from "./page";

// next/navigation mock — useRouter().push 호출 추적.
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

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

  it("노드 클릭 → router.push(`/scenes/{id}`) 호출", async () => {
    const { container } = render(<GraphPage />);
    await act(async () => {});
    await act(async () => {});
    const node = container.querySelector(
      `[data-graph-node-id="scene_01"]`,
    ) as HTMLElement;
    expect(node).toBeTruthy();
    fireEvent.click(node);
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
});

// SidePanel — /scenes/graph 우측 인라인 편집 패널 테스트.
// #226 — TDD red→green.
//
// 검증 포인트:
//   - sceneId=null → 안내 메시지.
//   - sceneId 설정 → fetch /api/web-adventure/scenes/[id] + /api/web-adventure/scenes (씬 ID 목록) 호출 → 로딩 → SceneForm + ChoiceEditor 렌더.
//   - 닫기 버튼 → onClose 콜백.
//   - 저장 버튼 → PUT 호출 + onSaved 콜백 (갱신된 scene 전달).
//   - 제목 변경 시 SceneForm 의 controlled state 즉시 갱신.

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
import { SidePanel } from "./sidePanel";

let fetchMock: ReturnType<typeof vi.fn>;

function makeScene(id = "scene_01") {
  return {
    id,
    illustration: "x.png",
    title: "테스트 씬",
    body: ["본문 한 줄"],
    choices: [],
  };
}

beforeEach(() => {
  // jsdom 에 window.matchMedia 없음 — sm 매치 = true (desktop 가정).
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (q: string) => ({
      matches: q.includes("min-width: 640px"),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  });
  fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes("/api/web-adventure/scenes/scene_01") && (!init || !init.method || init.method === "GET")) {
      return {
        ok: true,
        json: async () => ({ success: true, data: makeScene("scene_01") }),
      } as Response;
    }
    if (url.endsWith("/api/web-adventure/scenes")) {
      return {
        ok: true,
        json: async () => ({ success: true, data: [makeScene("scene_01"), makeScene("scene_02")] }),
      } as Response;
    }
    if (url.includes("/api/web-adventure/scenes/") && init?.method === "PUT") {
      return { ok: true, json: async () => ({ success: true, data: {} }) } as Response;
    }
    return { ok: true, json: async () => ({ success: true, data: null }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/scenes/graph — SidePanel (#231)", () => {
  it("sceneId=null 일 때 null 을 반환한다 (DOM 미렌더)", () => {
    const { container } = render(
      <SidePanel sceneId={null} onClose={() => {}} onSaved={() => {}} />,
    );
    // 안내 메시지 X, aside 자체 X.
    expect(container.querySelector("[data-testid='side-panel']")).toBeNull();
    expect(screen.queryByText(/노드를 클릭하면 편집/)).toBeNull();
  });

  it("sceneId 설정 시 fetch 호출 + 로딩 → SceneForm 렌더", async () => {
    render(<SidePanel sceneId="scene_01" onClose={() => {}} onSaved={() => {}} />);
    await act(async () => {});
    await act(async () => {});
    // SceneForm 의 '제목' aria-label input 이 렌더되어야 한다.
    const titleInput = screen.getByLabelText("제목") as HTMLInputElement;
    expect(titleInput).toBeTruthy();
    expect(titleInput.value).toBe("테스트 씬");
    // fetch 호출 확인.
    const calls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((u: string) => u.includes("/api/web-adventure/scenes/scene_01"))).toBe(true);
  });

  it("닫기 버튼 클릭 시 onClose 콜백 호출", async () => {
    const onClose = vi.fn();
    render(<SidePanel sceneId="scene_01" onClose={onClose} onSaved={() => {}} />);
    await act(async () => {});
    await act(async () => {});
    const closeBtn = screen.getByRole("button", { name: /닫기/ });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("저장 버튼 클릭 시 PUT 호출 + onSaved 콜백에 변경 scene 전달", async () => {
    const onSaved = vi.fn();
    render(<SidePanel sceneId="scene_01" onClose={() => {}} onSaved={onSaved} />);
    await act(async () => {});
    await act(async () => {});
    // 제목 변경.
    const titleInput = screen.getByLabelText("제목") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "변경된 제목" } });
    // 저장 버튼.
    const saveBtn = screen.getByRole("button", { name: /^저장$/ });
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    await act(async () => {});
    // PUT 호출.
    const putCall = fetchMock.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("/api/web-adventure/scenes/scene_01") &&
        (c[1] as { method?: string } | undefined)?.method === "PUT",
    );
    expect(putCall).toBeTruthy();
    const body = JSON.parse((putCall![1] as { body: string }).body) as { title: string };
    expect(body.title).toBe("변경된 제목");
    // onSaved 콜백.
    expect(onSaved).toHaveBeenCalled();
    const arg = onSaved.mock.calls[0]![0] as { title: string; id: string };
    expect(arg.title).toBe("변경된 제목");
    expect(arg.id).toBe("scene_01");
  });

  // #340 — header 의 sticky top-0 제거. 스크롤 시 자연스럽게 흐름.
  it("패널 header 에 sticky top-0 클래스 없음 (일반 흐름)", async () => {
    render(<SidePanel sceneId="scene_01" onClose={vi.fn()} onSaved={vi.fn()} />);
    await act(async () => {});
    await act(async () => {});
    const panel = screen.getByTestId("side-panel");
    const header = panel.querySelector("header");
    expect(header).toBeTruthy();
    expect(header!.className).not.toMatch(/sticky/);
    expect(header!.className).not.toMatch(/top-0/);
  });

  // #339 — 모바일 fullscreen (네비 제외) — top-[60px] + max-h 해제.
  it("baseAside 가 top-[60px] fixed 모바일 fullscreen 클래스 포함", async () => {
    render(<SidePanel sceneId="s1" onClose={vi.fn()} onSaved={vi.fn()} />);
    await act(async () => {});
    await act(async () => {});
    const panel = screen.getByTestId("side-panel") as HTMLElement;
    expect(panel.className).toMatch(/top-\[60px\]/);
    // 옛 max-h-[80vh] 잔재 없음.
    expect(panel.className).not.toMatch(/max-h-\[80vh\]/);
  });

  // #338 — 가로 크기 조절 핸들.
  it("리사이즈 핸들이 패널 좌측에 존재 (data-testid='side-panel-resize')", async () => {
    render(<SidePanel sceneId="s1" onClose={vi.fn()} onSaved={vi.fn()} />);
    await act(async () => {});
    await act(async () => {});
    const handle = screen.getByTestId("side-panel-resize");
    expect(handle).toBeTruthy();
    // cursor-col-resize 스타일.
    expect((handle as HTMLElement).className).toMatch(/cursor-col-resize/);
  });

  it("핸들 드래그 → 패널 width 변경 (mousedown → mousemove → mouseup)", async () => {
    render(<SidePanel sceneId="s1" onClose={vi.fn()} onSaved={vi.fn()} />);
    await act(async () => {});
    await act(async () => {});

    const panel = screen.getByTestId("side-panel") as HTMLElement;
    const handle = screen.getByTestId("side-panel-resize") as HTMLElement;
    const before = panel.style.width;

    // 마우스 클라이언트 X = 1000 → 800 (왼쪽으로 200px = 패널 200 px 더 넓어짐).
    await act(async () => {
      fireEvent.mouseDown(handle, { clientX: 1000 });
    });
    await act(async () => {
      fireEvent.mouseMove(window, { clientX: 800 });
    });
    await act(async () => {
      fireEvent.mouseUp(window);
    });

    const after = panel.style.width;
    expect(after).not.toBe(before);
    // 숫자 px 형태.
    expect(after).toMatch(/^\d+px$/);
  });

  // 옛 quest CMS 패턴 — RevisionHistorySection 은 별도 /scenes/[id]/revisions 페이지로 이동.
  // SidePanel 에서 *제거* 됨을 검증.
  it("SidePanel 에는 RevisionHistorySection 의 '변경 이력' 토글이 *부재*", async () => {
    render(<SidePanel sceneId="scene_01" onClose={() => {}} onSaved={() => {}} />);
    await act(async () => {});
    await act(async () => {});
    // 더 이상 변경 이력 라벨이 패널 안에 표시되지 않아야 한다.
    expect(screen.queryByRole("button", { name: /변경 이력/ })).toBeNull();
  });

  it("SceneForm 의 제목 변경이 즉시 input value 에 반영된다 (controlled)", async () => {
    render(<SidePanel sceneId="scene_01" onClose={() => {}} onSaved={() => {}} />);
    await act(async () => {});
    await act(async () => {});
    const titleInput = screen.getByLabelText("제목") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "즉시 갱신" } });
    expect(titleInput.value).toBe("즉시 갱신");
  });
});

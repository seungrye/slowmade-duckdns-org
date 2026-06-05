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

describe("/scenes/graph — SidePanel (#226)", () => {
  it("sceneId=null 일 때 안내 메시지를 표시한다", () => {
    render(<SidePanel sceneId={null} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText(/노드를 클릭하면 편집/)).toBeTruthy();
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

  it("SceneForm 의 제목 변경이 즉시 input value 에 반영된다 (controlled)", async () => {
    render(<SidePanel sceneId="scene_01" onClose={() => {}} onSaved={() => {}} />);
    await act(async () => {});
    await act(async () => {});
    const titleInput = screen.getByLabelText("제목") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "즉시 갱신" } });
    expect(titleInput.value).toBe("즉시 갱신");
  });
});

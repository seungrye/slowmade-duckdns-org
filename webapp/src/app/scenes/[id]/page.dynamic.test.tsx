// /scenes/[id] 페이지 — 저장 시 PUT 응답으로 scene 갱신 검증.
//
// 사용자 보고 — 저장 후 '리비전 보기 (n개)' 의 n 이 갱신되지 않음.
// 원인: handleSave 가 응답 body 의 scene (revisionCount 포함) 을 setScene 하지 않음.
// fix: setScene(json.data) 로 갱신 → revisionCount 라벨 즉시 반영.

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import SceneEditPage from "./page";

let fetchMock: ReturnType<typeof vi.fn>;

// 초기 GET 응답 — revisionCount = 5.
const initialScene = {
  _id: "abc123",
  id: "kael_infirmary",
  title: "옛 제목",
  illustration: "x.png",
  body: ["옛 본문"],
  choices: [],
  revisionCount: 5,
};
// PUT 응답 — revisionCount = 6 으로 증가.
const updatedScene = {
  _id: "abc123",
  id: "kael_infirmary",
  title: "옛 제목",
  illustration: "x.png",
  body: ["옛 본문"],
  choices: [],
  revisionCount: 6,
};

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const u = typeof url === "string" ? url : "";
    const method = init?.method ?? "GET";
    if (u.endsWith("/api/web-adventure/scenes") && method === "GET") {
      return {
        ok: true,
        json: async () => ({ success: true, data: [initialScene] }),
      } as Response;
    }
    if (u.endsWith("/api/web-adventure/scenes/kael_infirmary") && method === "GET") {
      return {
        ok: true,
        json: async () => ({ success: true, data: initialScene }),
      } as Response;
    }
    if (u.endsWith("/api/web-adventure/scenes/kael_infirmary") && method === "PUT") {
      return {
        ok: true,
        json: async () => ({ success: true, data: updatedScene }),
      } as Response;
    }
    return { ok: true, json: async () => ({ success: true, data: null }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/scenes/[id] — 저장 시 PUT 응답으로 scene 갱신 (revisionCount UI 동기화)", () => {
  it("저장 후 '리비전 보기 (n개)' 라벨이 응답의 새 revisionCount 로 갱신된다", async () => {
    const params = Promise.resolve({ id: "kael_infirmary" });
    let unmount: (() => void) | null = null;
    await act(async () => {
      const { unmount: u } = render(<SceneEditPage params={params} />);
      unmount = u;
    });
    // 초기 로딩 완료 — '리비전 보기 (5개)' 라벨 노출.
    await waitFor(() => {
      expect(screen.getByText(/리비전 보기 \(5개\)/)).toBeTruthy();
    });

    // 저장 버튼 클릭.
    const saveBtn = screen.getByRole("button", { name: /^저장$/ });
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    // PUT 응답 처리 완료 후 — 라벨이 (6개) 로 갱신.
    await waitFor(() => {
      expect(screen.getByText(/리비전 보기 \(6개\)/)).toBeTruthy();
    });

    if (unmount) (unmount as () => void)();
  });
});

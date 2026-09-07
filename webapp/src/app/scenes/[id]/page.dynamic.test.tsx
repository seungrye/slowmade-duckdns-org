// The /scenes/[id] page - verifying that saving updates the scene from the PUT response.
//
// Reported by a user - the n in 'view revisions (n)' did not update after saving.
// The cause: handleSave never setScene'd the response body's scene (which carries revisionCount).
// The fix: setScene(json.data) -> the revisionCount label updates at once.

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import SceneEditPage from "./page";

let fetchMock: ReturnType<typeof vi.fn>;

// The initial GET response - revisionCount = 5.
const initialScene = {
  _id: "abc123",
  id: "kael_infirmary",
  title: "옛 제목",
  illustration: "x.png",
  body: ["옛 본문"],
  choices: [],
  revisionCount: 5,
};
// The PUT response - revisionCount up to 6.
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
    // The initial load has finished - the 'view revisions (5)' label is shown.
    await waitFor(() => {
      expect(screen.getByText(/리비전 보기 \(5개\)/)).toBeTruthy();
    });

    // Clicking the save button.
    const saveBtn = screen.getByRole("button", { name: /^저장$/ });
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    // Once the PUT response is handled - the label updates to (6).
    await waitFor(() => {
      expect(screen.getByText(/리비전 보기 \(6개\)/)).toBeTruthy();
    });

    if (unmount) (unmount as () => void)();
  });
});

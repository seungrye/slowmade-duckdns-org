// RevisionHistorySection — diff UI 단위 테스트.
//
// 새 의미 (git-like):
//   v0 = 최초 작성 (직전 없음 → "최초 작성" 표시)
//   v_N (N>=1) = N 번째 commit. diff = v_{N-1} snapshot → v_N snapshot.
//
// 검증:
//   - v0 클릭 → "최초 작성" 메시지, diff 없음.
//   - v1 클릭 → v0/v1 두 snapshot fetch + diff 영역 렌더.

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen, fireEvent, within } from "@testing-library/react";
import { RevisionHistorySection } from "./revisionHistorySection";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/revisions") && (!init || !init.method || init.method === "GET")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: [
            // 목록은 version DESC. v1, v0.
            { _id: "r2", version: 1, createdAt: "2026-06-06T09:00:00.000Z", author: "system" },
            { _id: "r1", version: 0, createdAt: "2026-06-06T08:00:00.000Z", author: "system" },
          ],
        }),
      } as Response;
    }
    const m = url.match(/\/revisions\/(\d+)$/);
    if (m) {
      const v = Number(m[1]);
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            _id: `r${v + 1}`,
            sceneId: "kael_infirmary",
            version: v,
            snapshot: {
              id: "kael_infirmary",
              title: v === 0 ? "옛 제목" : "새 제목",
              illustration: "x.png",
              body: [v === 0 ? "옛 본문" : "새 본문"],
              choices: [],
            },
            author: "system",
            createdAt: v === 0
              ? "2026-06-06T08:00:00.000Z"
              : "2026-06-06T09:00:00.000Z",
          },
        }),
      } as Response;
    }
    return { ok: true, json: async () => ({ success: true, data: null }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RevisionHistorySection — text diff UI (v_{N-1} → v_N)", () => {
  it("v0 클릭 → '최초 작성' 표시, diff 없음", async () => {
    render(
      <RevisionHistorySection
        sceneId="kael_infirmary"
        onRestore={vi.fn()}
        defaultOpen={true}
      />,
    );
    await act(async () => {});
    await act(async () => {});

    const v0Btn = screen.getByRole("button", { name: /v0/ });
    await act(async () => {
      fireEvent.click(v0Btn);
    });
    await act(async () => {});

    // diff 미노출.
    expect(screen.queryByTestId("revision-diff")).toBeNull();
    // "최초 작성" 메시지.
    expect(screen.getByText(/최초 작성/)).toBeTruthy();
  });

  it("v1 클릭 → v0/v1 snapshot 모두 fetch + diff 영역 렌더 (v0 → v1 변경)", async () => {
    render(
      <RevisionHistorySection
        sceneId="kael_infirmary"
        onRestore={vi.fn()}
        defaultOpen={true}
      />,
    );
    await act(async () => {});
    await act(async () => {});

    const v1Btn = screen.getByRole("button", { name: /v1/ });
    await act(async () => {
      fireEvent.click(v1Btn);
    });
    await act(async () => {});
    await act(async () => {});

    // diff 컨테이너 노출.
    const diff = await screen.findByTestId("revision-diff");
    expect(diff).toBeTruthy();

    // 추가/삭제 라인 — v0 ("옛") → v1 ("새") 차이.
    const addedLines = within(diff).getAllByTestId("revision-diff-line-added");
    const removedLines = within(diff).getAllByTestId("revision-diff-line-removed");
    expect(addedLines.length).toBeGreaterThan(0);
    expect(removedLines.length).toBeGreaterThan(0);

    // 추가 라인에 '새' 가 포함.
    expect(addedLines.some((el) => /새/.test(el.textContent ?? ""))).toBe(true);
    // 삭제 라인에 '옛' 가 포함.
    expect(removedLines.some((el) => /옛/.test(el.textContent ?? ""))).toBe(true);
  });
});

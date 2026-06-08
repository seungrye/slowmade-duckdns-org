// RevisionHistorySection — SidePanel 안 collapsible 변경 이력 섹션 테스트.
//
// 검증 포인트:
//   - 기본 접힘 — 리스트 미 fetch.
//   - 펼치면 fetch /api/web-adventure/scenes/[id]/revisions → 목록 렌더.
//   - 항목 클릭 → snapshot fetch + 미리보기 (제목/body 첫 줄).
//   - 복원 버튼 → confirm → POST /restore → onRestore 콜백.

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
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
            { _id: "r3", version: 3, createdAt: "2026-06-08T10:00:00.000Z", author: "system" },
            { _id: "r2", version: 2, createdAt: "2026-06-07T09:00:00.000Z", author: "system" },
            { _id: "r1", version: 1, createdAt: "2026-06-06T08:00:00.000Z", author: "system" },
          ],
        }),
      } as Response;
    }
    if (url.match(/\/revisions\/\d+$/)) {
      const m = url.match(/\/(\d+)$/);
      const version = m ? Number(m[1]) : 0;
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            _id: `r${version}`,
            sceneId: "kael_infirmary",
            version,
            snapshot: {
              id: "kael_infirmary",
              title: `v${version} 옛 제목`,
              body: [`v${version} 본문 첫 줄`],
              choices: [],
            },
            author: "system",
            createdAt: "2026-06-06T08:00:00.000Z",
          },
        }),
      } as Response;
    }
    if (url.endsWith("/restore") && init?.method === "POST") {
      return { ok: true, json: async () => ({ success: true, data: {} }) } as Response;
    }
    return { ok: true, json: async () => ({ success: true, data: null }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/scenes/graph — RevisionHistorySection", () => {
  it("기본 접힘 상태 — 리스트 미 fetch", () => {
    render(<RevisionHistorySection sceneId="kael_infirmary" onRestore={vi.fn()} />);
    // 초기 fetch 호출 없음.
    expect(fetchMock).not.toHaveBeenCalled();
    // 토글 버튼은 보임.
    expect(screen.getByRole("button", { name: /변경 이력/ })).toBeTruthy();
  });

  it("펼치면 목록 fetch + 렌더", async () => {
    render(<RevisionHistorySection sceneId="kael_infirmary" onRestore={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: /변경 이력/ });
    await act(async () => {
      fireEvent.click(toggle);
    });
    await act(async () => {});
    // fetch 호출 — /revisions 엔드포인트.
    expect(fetchMock.mock.calls.some((c: unknown[]) =>
      typeof c[0] === "string" && (c[0] as string).endsWith("/api/web-adventure/scenes/kael_infirmary/revisions"),
    )).toBe(true);
    // 항목 3 개 렌더 — v3, v2, v1.
    expect(screen.getByText(/v3/)).toBeTruthy();
    expect(screen.getByText(/v2/)).toBeTruthy();
    expect(screen.getByText(/v1/)).toBeTruthy();
  });

  it("항목 클릭 시 snapshot fetch + 미리보기 (제목 + body 첫 줄)", async () => {
    render(<RevisionHistorySection sceneId="kael_infirmary" onRestore={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: /변경 이력/ });
    await act(async () => { fireEvent.click(toggle); });
    await act(async () => {});
    // v2 클릭.
    const v2Btn = screen.getByRole("button", { name: /v2/ });
    await act(async () => { fireEvent.click(v2Btn); });
    await act(async () => {});
    // snapshot fetch 호출.
    expect(fetchMock.mock.calls.some((c: unknown[]) =>
      typeof c[0] === "string" && (c[0] as string).endsWith("/revisions/2"),
    )).toBe(true);
    // 미리보기 — 제목 + body 첫 줄.
    expect(screen.getByText(/v2 옛 제목/)).toBeTruthy();
    expect(screen.getByText(/v2 본문 첫 줄/)).toBeTruthy();
  });

  it("복원 버튼 클릭 시 confirm + POST /restore + onRestore 콜백", async () => {
    const onRestore = vi.fn();
    render(<RevisionHistorySection sceneId="kael_infirmary" onRestore={onRestore} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /변경 이력/ })); });
    await act(async () => {});
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /v2/ })); });
    await act(async () => {});
    const restoreBtn = screen.getByRole("button", { name: /이 내용으로 되돌리기/ });
    await act(async () => { fireEvent.click(restoreBtn); });
    await act(async () => {});
    // POST /restore 호출.
    const postCall = fetchMock.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).endsWith("/restore") &&
        (c[1] as { method?: string } | undefined)?.method === "POST",
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse((postCall![1] as { body: string }).body) as { version: number };
    expect(body.version).toBe(2);
    // onRestore 콜백.
    expect(onRestore).toHaveBeenCalled();
  });

  it("confirm 취소 시 POST 호출 안 됨", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const onRestore = vi.fn();
    render(<RevisionHistorySection sceneId="kael_infirmary" onRestore={onRestore} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /변경 이력/ })); });
    await act(async () => {});
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /v2/ })); });
    await act(async () => {});
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /이 내용으로 되돌리기/ })); });
    await act(async () => {});
    const postCalled = fetchMock.mock.calls.some(
      (c: unknown[]) =>
        typeof c[0] === "string" &&
        (c[0] as string).endsWith("/restore") &&
        (c[1] as { method?: string } | undefined)?.method === "POST",
    );
    expect(postCalled).toBe(false);
    expect(onRestore).not.toHaveBeenCalled();
  });
});

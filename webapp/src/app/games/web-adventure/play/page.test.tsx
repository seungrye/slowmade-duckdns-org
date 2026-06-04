// @vitest-environment jsdom
// Phase D RED — play/page.tsx 가 getScenes() 로 mongo 컨텐츠를 로드,
// loading / error / 정상 phase 를 UI 로 보여준다.

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// next/font 가 jsdom 에서 깨지지 않도록 stub.
vi.mock("next/font/google", () => ({
  Manrope: () => ({ className: "manrope" }),
}));

import PlayPage from "./page";
import { resetSceneCache } from "@/lib/web-adventure/engine/sceneRegistry";
import { scenes as staticScenes } from "@/lib/web-adventure/engine/sceneRegistry";

describe("WebAdventurePlayPage — Phase D 동적 fetch UI", () => {
  beforeEach(() => {
    resetSceneCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("씬 데이터 로딩 중 loading 메시지 표시", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<PlayPage />);
    expect(screen.getByText(/씬 데이터 로딩/)).toBeInTheDocument();
  });

  test("fetch 실패 시 error 메시지 + 재시도 버튼", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    render(<PlayPage />);
    await waitFor(() =>
      expect(screen.getByText(/오류/)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /재시도/ })).toBeInTheDocument();
  });

  test("scenes 로드 후 CharacterCreator 표시", async () => {
    const sceneList = Object.values(staticScenes);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { scenes: sceneList },
        }),
      }),
    );
    render(<PlayPage />);
    await waitFor(() =>
      expect(screen.getByText(/캐릭터 생성/)).toBeInTheDocument(),
    );
  });

  test("재시도 버튼 클릭 시 fetch 재호출", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { scenes: Object.values(staticScenes) },
        }),
      });
    vi.stubGlobal("fetch", mockFetch);

    render(<PlayPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /재시도/ })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /재시도/ }));

    await waitFor(() =>
      expect(screen.getByText(/캐릭터 생성/)).toBeInTheDocument(),
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

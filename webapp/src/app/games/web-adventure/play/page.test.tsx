// @vitest-environment jsdom
// Phase D RED — play/page.tsx 가 getScenes() 로 mongo 컨텐츠를 로드,
// loading / error / 정상 phase 를 UI 로 보여준다.

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { act } from "react";

// next/font 가 jsdom 에서 깨지지 않도록 stub.
vi.mock("next/font/google", () => ({
  Manrope: () => ({ className: "manrope" }),
}));

import PlayPage from "./page";
import InventoryStrip from "./InventoryStrip";
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
    // #238 — useAutoSave 가 마운트 시 /api/web-adventure/save GET 추가 호출.
    // 여기서는 *content fetch* 만 카운트 (재시도 → 1차 실패 + 2차 성공).
    const contentCalls = mockFetch.mock.calls.filter((args: unknown[]) =>
      String(args[0]).includes('/content/v1'),
    );
    expect(contentCalls.length).toBe(2);
  });
});

// #220 — InventoryStrip 인벤 표시 시 같은 아이템 갯수 묶기.
describe("InventoryStrip — #220 인벤 그룹화 표시", () => {
  test("인벤에 bread 2 + torch 1 → '빵 × 2', '횃불' 표시 + '빵 × 1' 비포함", () => {
    render(
      <InventoryStrip
        inventory={["bread", "bread", "torch"]}
        rerollsLeft={0}
        hp={100}
        maxHp={100}
        onUseItem={() => {}}
        onReroll={() => {}}
        canReroll={false}
      />,
    );
    expect(screen.getByText(/빵 × 2/)).toBeInTheDocument();
    expect(screen.getByText(/^횃불$/)).toBeInTheDocument();
    expect(screen.queryByText(/빵 × 1/)).not.toBeInTheDocument();
  });

  test("bread 2 보유 시 '사용' 버튼이 1개만 렌더 (각 bread 별이 아니라 그룹된 id 기준)", () => {
    render(
      <InventoryStrip
        inventory={["bread", "bread"]}
        rerollsLeft={0}
        hp={100}
        maxHp={100}
        onUseItem={() => {}}
        onReroll={() => {}}
        canReroll={false}
      />,
    );
    const useButtons = screen.getAllByRole("button", { name: /사용/ });
    expect(useButtons).toHaveLength(1);
  });

  test("count===1 인 아이템은 '× 1' 표시 없이 이름만", () => {
    render(
      <InventoryStrip
        inventory={["torch", "spirit_glasses"]}
        rerollsLeft={0}
        hp={100}
        maxHp={100}
        onUseItem={() => {}}
        onReroll={() => {}}
        canReroll={false}
      />,
    );
    expect(screen.getByText(/^횃불$/)).toBeInTheDocument();
    expect(screen.getByText(/^산신령의 안경$/)).toBeInTheDocument();
    expect(screen.queryByText(/× 1/)).not.toBeInTheDocument();
  });

  test("사용 버튼 클릭 시 onUseItem 이 그룹된 id 로 호출", () => {
    const onUseItem = vi.fn();
    render(
      <InventoryStrip
        inventory={["bread", "bread", "herb"]}
        rerollsLeft={0}
        hp={100}
        maxHp={100}
        onUseItem={onUseItem}
        onReroll={() => {}}
        canReroll={false}
      />,
    );
    const useButtons = screen.getAllByRole("button", { name: /사용/ });
    // bread, herb 각각 한 번씩 — 총 2 개.
    expect(useButtons).toHaveLength(2);
    act(() => {
      fireEvent.click(useButtons[0]);
    });
    expect(onUseItem).toHaveBeenCalledWith("bread");
  });
});

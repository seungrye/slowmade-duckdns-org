// @vitest-environment jsdom
// Phase D RED - play/page.tsx loads the mongo content through getScenes(),
// showing the loading, error and normal phases in the UI.

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { act } from "react";

// Stubbed so next/font does not break under jsdom.
// #240 - useMigrateOnLogin calls useSession. The tests have no SessionProvider -> mocked.
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

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

  test("fetch 실패 시 error 메시지 + 재시도 버튼 (#292 — retry 3 회 모두 fail 후)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    render(<PlayPage />);
    // #292 - getScenes retries (a 500ms then 1500ms backoff). The error shows after about 2 seconds in all.
    await waitFor(() => expect(screen.getByText(/오류/)).toBeInTheDocument(), {
      timeout: 5000,
    });
    expect(screen.getByRole("button", { name: /재시도/ })).toBeInTheDocument();
  }, 8000);

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
      expect(screen.getByText(/너의 운명을 선택하라/)).toBeInTheDocument(),
    );
  });

  test("재시도 버튼 클릭 시 fetch 재호출", async () => {
    // #292 - *all of the first 3 calls fail* (the retries are spent) -> the user retries -> the 4th succeeds.
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
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
    // The first retry batch (3 calls) all fail -> the retry button.
    await waitFor(
      () => expect(screen.getByRole("button", { name: /재시도/ })).toBeInTheDocument(),
      { timeout: 5000 },
    );
    fireEvent.click(screen.getByRole("button", { name: /재시도/ }));

    await waitFor(() =>
      expect(screen.getByText(/너의 운명을 선택하라/)).toBeInTheDocument(),
    );
    // #292 - the content fetch count: the first batch of 3 (every retry failing) plus 1 retry = 4.
    const contentCalls = mockFetch.mock.calls.filter((args: unknown[]) =>
      String(args[0]).includes('/content/v1'),
    );
    expect(contentCalls.length).toBe(4);
  }, 10000);
});

// #220 - InventoryStrip groups identical items by count when showing the inventory.
describe("InventoryStrip — #220 인벤 그룹화 표시", () => {
  test("인벤에 medical_bandage 2 + ether_refined_water 1 → '빵 × 2', '횃불' 표시 + '빵 × 1' 비포함", () => {
    render(
      <InventoryStrip
        inventory={["medical_bandage", "medical_bandage", "ether_refined_water"]}
        rerollsLeft={0}
        hp={100}
        maxHp={100}
        onUseItem={() => {}}
        onReroll={() => {}}
        canReroll={false}
      />,
    );
    expect(screen.getByText(/의료용 붕대 × 2/)).toBeInTheDocument();
    expect(screen.getByText(/^에테르 정제수$/)).toBeInTheDocument();
    expect(screen.queryByText(/의료용 붕대 × 1/)).not.toBeInTheDocument();
  });

  test("medical_bandage 2 보유 시 '사용' 버튼이 1개만 렌더 (각 medical_bandage 별이 아니라 그룹된 id 기준)", () => {
    render(
      <InventoryStrip
        inventory={["medical_bandage", "medical_bandage"]}
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
        inventory={["ether_refined_water", "spirit_beast_feather"]}
        rerollsLeft={0}
        hp={100}
        maxHp={100}
        onUseItem={() => {}}
        onReroll={() => {}}
        canReroll={false}
      />,
    );
    expect(screen.getByText(/^에테르 정제수$/)).toBeInTheDocument();
    expect(screen.getByText(/^영수의 깃털$/)).toBeInTheDocument();
    expect(screen.queryByText(/× 1/)).not.toBeInTheDocument();
  });

  test("사용 버튼 클릭 시 onUseItem 이 그룹된 id 로 호출", () => {
    const onUseItem = vi.fn();
    render(
      <InventoryStrip
        inventory={["medical_bandage", "medical_bandage", "ether_refined_water"]}
        rerollsLeft={0}
        hp={100}
        maxHp={100}
        onUseItem={onUseItem}
        onReroll={() => {}}
        canReroll={false}
      />,
    );
    const useButtons = screen.getAllByRole("button", { name: /사용/ });
    // medical_bandage (grouped) and ether_refined_water once each - 2 in all.
    expect(useButtons).toHaveLength(2);
    act(() => {
      fireEvent.click(useButtons[0]);
    });
    expect(onUseItem).toHaveBeenCalledWith("medical_bandage");
  });
});

// #273 게임 핵심 모먼트 analytics 이벤트.
//
// 검증 (단위) — page.tsx 의 발화 위치는 통합 테스트가 별도 검증.
// 본 테스트는 *analytics 헬퍼* 가 새 이벤트명을 prefix 와 함께 올바르게 전송하는지.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/firebase", () => ({
  getFirebaseAnalytics: () => Promise.resolve({}),
}));
vi.mock("firebase/analytics", () => ({ logEvent: vi.fn() }));

describe("게임 모먼트 analytics (#273)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { document: {} });
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID", "G-TEST");
  });

  it("adv_stigma_critical — 침식 80+ 첫 도달", async () => {
    const { logAdvEvent } = await import("../analytics");
    const { logEvent } = await import("firebase/analytics");
    logAdvEvent("stigma_critical", {
      stigma_erosion: 80,
      protagonist: "kael",
      run_index: 0,
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(logEvent).toHaveBeenCalledWith(
      {},
      "adv_stigma_critical",
      expect.objectContaining({ stigma_erosion: 80, protagonist: "kael" }),
    );
  });

  it("adv_petrification_auto — reducer 자동 100 도달", async () => {
    const { logAdvEvent } = await import("../analytics");
    const { logEvent } = await import("firebase/analytics");
    logAdvEvent("petrification_auto", { protagonist: "kael", run_index: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(logEvent).toHaveBeenCalledWith(
      {},
      "adv_petrification_auto",
      expect.objectContaining({ protagonist: "kael", run_index: 1 }),
    );
  });

  it("adv_save_persisted — autoSave 성공", async () => {
    const { logAdvEvent } = await import("../analytics");
    const { logEvent } = await import("firebase/analytics");
    logAdvEvent("save_persisted", { scene_id: "omphalos_station" });
    await new Promise((r) => setTimeout(r, 0));
    expect(logEvent).toHaveBeenCalledWith(
      {},
      "adv_save_persisted",
      expect.objectContaining({ scene_id: "omphalos_station" }),
    );
  });

  it("adv_world_flag_applied — 회차 부메랑 flag 주입", async () => {
    const { logAdvEvent } = await import("../analytics");
    const { logEvent } = await import("firebase/analytics");
    logAdvEvent("world_flag_applied", {
      flags: ["world.harmony_kept", "world.solaris_strong"],
      run_index: 2,
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(logEvent).toHaveBeenCalledWith(
      {},
      "adv_world_flag_applied",
      expect.objectContaining({ run_index: 2 }),
    );
  });
});

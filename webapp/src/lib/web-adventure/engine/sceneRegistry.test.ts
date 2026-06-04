// Phase D RED — sceneRegistry getScenes() fetch + 캐시 + inflight singleton.
//
// 정적 `scenes` export 는 마이그레이션/시나리오 테스트 fallback 용으로 *유지*.
// 새로 도입하는 `getScenes()` 는 /api/web-adventure/content/v1 을 fetch 하여
// SceneRegistry 를 반환하고, 모듈-level 캐시 + 동시 호출 inflight 싱글톤을 가진다.

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { getScenes, resetSceneCache } from "./sceneRegistry";

describe("getScenes — Phase D 동적 fetch + 캐시", () => {
  beforeEach(() => {
    resetSceneCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("getScenes 가 /api/web-adventure/content/v1 을 fetch 한다", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          scenes: [
            {
              id: "s1",
              title: "T1",
              body: ["a"],
              choices: [],
              illustration: "/x",
            },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const scenes = await getScenes();

    expect(mockFetch).toHaveBeenCalledWith("/api/web-adventure/content/v1");
    expect(scenes.s1).toBeDefined();
    expect(scenes.s1.title).toBe("T1");
  });

  test("getScenes 가 캐시 hit 시 fetch 호출 X", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { scenes: [] } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await getScenes();
    await getScenes();
    await getScenes();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("getScenes 동시 호출 시 single inflight 보장", async () => {
    let resolveResp!: (v: unknown) => void;
    const pending = new Promise((r) => {
      resolveResp = r;
    });
    const mockFetch = vi.fn().mockReturnValue(pending);
    vi.stubGlobal("fetch", mockFetch);

    const p1 = getScenes();
    const p2 = getScenes();
    const p3 = getScenes();

    expect(mockFetch).toHaveBeenCalledTimes(1);

    resolveResp({
      ok: true,
      json: async () => ({ success: true, data: { scenes: [] } }),
    });

    await Promise.all([p1, p2, p3]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("getScenes 가 4xx/5xx 응답 시 throw", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal("fetch", mockFetch);

    await expect(getScenes()).rejects.toThrow(/500/);
  });

  test("force=true 옵션이 캐시 무시 + 재 fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { scenes: [] } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await getScenes();
    await getScenes();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await getScenes({ force: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("getScenes 가 fetch 실패 (reject) 후 inflight 해제 — 다음 호출 재시도 가능", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            scenes: [
              {
                id: "s2",
                title: "T2",
                body: ["b"],
                choices: [],
                illustration: "/y",
              },
            ],
          },
        }),
      });
    vi.stubGlobal("fetch", mockFetch);

    await expect(getScenes()).rejects.toThrow(/network/);

    const scenes = await getScenes();
    expect(scenes.s2?.title).toBe("T2");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

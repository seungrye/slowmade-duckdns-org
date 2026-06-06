// #292 sceneRegistry.getScenes — 일시 네트워크 fail 자동 retry.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getScenes, resetSceneCache } from "./sceneRegistry";

describe("getScenes retry (#292)", () => {
  beforeEach(() => {
    resetSceneCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    resetSceneCache();
  });

  it("첫 fetch 200 → 캐시", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, data: { scenes: [{ id: "s1" }] } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const reg = await getScenes();
    expect(reg.s1).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("1차 fail (500) → 2차 성공 → 정상 반환 (총 2 호출)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("err", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: { scenes: [{ id: "ok" }] } }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const p = getScenes();
    // 500ms backoff 진행.
    await vi.advanceTimersByTimeAsync(500);
    const reg = await p;
    expect(reg.ok).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("3 번 모두 fail → throw", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("err", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const p = getScenes().catch((e) => e);
    await vi.advanceTimersByTimeAsync(500 + 1500 + 10);
    const err = await p;
    expect(err).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 초기 + 2 retry
  });
});

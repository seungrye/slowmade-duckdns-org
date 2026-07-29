import { describe, it, expect, vi } from "vitest";
import { fetchScenes, DEFAULT_API_BASE, START_SCENE_ID } from "../src/content-client.js";

function okResponse(scenes) {
  return { ok: true, json: async () => ({ success: true, data: { scenes } }) };
}

describe("content-client fetchScenes", () => {
  it("scenes 배열을 {id: scene} 맵으로 변환", async () => {
    const scenes = [
      { id: "a", body: ["x"] },
      { id: "b", body: ["y"] },
    ];
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(scenes));
    const map = await fetchScenes({ baseUrl: "http://t", fetchImpl });
    expect(Object.keys(map)).toEqual(["a", "b"]);
    expect(map.a.body).toEqual(["x"]);
  });

  it("기본 baseUrl + content/v1 경로로 요청", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse([]));
    await fetchScenes({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(`${DEFAULT_API_BASE}/api/web-adventure/content/v1`);
  });

  it("일시 실패 후 재시도로 성공", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("net"))
      .mockResolvedValueOnce(okResponse([{ id: "a" }]));
    const map = await fetchScenes({ fetchImpl, baseUrl: "http://t", backoffs: [0, 0] });
    expect(map.a).toBeDefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("모든 재시도 실패 시 throw (1 + 2회)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("net"));
    await expect(
      fetchScenes({ fetchImpl, baseUrl: "http://t", backoffs: [0, 0] }),
    ).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("res.ok=false 는 실패로 간주(상태코드 포함)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(
      fetchScenes({ fetchImpl, baseUrl: "http://t", retry: false }),
    ).rejects.toThrow(/500/);
  });

  it("START_SCENE_ID 를 export", () => {
    expect(START_SCENE_ID).toBe("kael_infirmary");
  });
});

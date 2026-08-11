import { describe, it, expect, vi } from "vitest";
import {
  fetchScenes, submitAppEndRun, DEFAULT_API_BASE, START_SCENE_ID,
  getVoiceCoverage, fetchScenesForRun,
} from "../src/content-client.js";

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

describe("content-client submitAppEndRun", () => {
  it("appKey 있으면 app-end-run 으로 x-app-key 헤더와 함께 POST", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    await submitAppEndRun(
      { endingId: "harmony", finalSceneId: "s", scenePath: ["a"], log: ["▶ x"] },
      { appKey: "K", baseUrl: "http://t", fetchImpl },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, opt] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://t/api/web-adventure/app-end-run");
    expect(opt.method).toBe("POST");
    expect(opt.headers["x-app-key"]).toBe("K");
    expect(JSON.parse(opt.body).endingId).toBe("harmony");
  });

  it("appKey 없으면 전송 안 함(미주입)", async () => {
    const fetchImpl = vi.fn();
    await submitAppEndRun({ endingId: "x", finalSceneId: "s" }, { appKey: "", baseUrl: "http://t", fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // 실패를 삼키되 성공 여부는 돌려준다 — 재시도 큐가 언제 지울지 판단해야 하므로. (#61)
  it("전송 실패는 삼키고 false 를 돌려준다(throw 안 함)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("net"));
    await expect(
      submitAppEndRun({ endingId: "x", finalSceneId: "s" }, { appKey: "K", baseUrl: "http://t", fetchImpl }),
    ).resolves.toBe(false);
  });

  it("서버가 4xx/5xx 면 false", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    await expect(
      submitAppEndRun({ endingId: "x", finalSceneId: "s" }, { appKey: "K", baseUrl: "http://t", fetchImpl }),
    ).resolves.toBe(false);
  });

  it("200 이면 true", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await expect(
      submitAppEndRun({ endingId: "x", finalSceneId: "s" }, { appKey: "K", baseUrl: "http://t", fetchImpl }),
    ).resolves.toBe(true);
  });

  it("키가 없으면 전송하지 않고 false", async () => {
    const fetchImpl = vi.fn();
    await expect(
      submitAppEndRun({ endingId: "x", finalSceneId: "s" }, { appKey: "", baseUrl: "http://t", fetchImpl }),
    ).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ── #87 문체(voice) 지원 ───────────────────────────────────────────────
describe("문체 지원 (#87)", () => {
  const scenesPayload = (bodyFirst) => ({
    ok: true,
    json: async () => ({
      data: {
        scenes: [{ id: "kael_infirmary", body: [bodyFirst] }],
        voices: { tolkien: { filled: 1, total: 1, complete: true } },
      },
    }),
  });

  it("voice 를 주면 쿼리로 붙여 요청한다", async () => {
    const urls = [];
    const fetchImpl = async (u) => { urls.push(u); return scenesPayload("톨킨"); };
    await fetchScenes({ baseUrl: "https://x", fetchImpl, voice: "tolkien" });
    expect(urls[0]).toContain("?voice=tolkien");
  });

  it("voice 가 없으면 쿼리를 붙이지 않는다", async () => {
    const urls = [];
    const fetchImpl = async (u) => { urls.push(u); return scenesPayload("기본"); };
    await fetchScenes({ baseUrl: "https://x", fetchImpl });
    expect(urls[0]).not.toContain("voice=");
  });

  it("응답의 voices 를 커버리지로 노출한다", async () => {
    const fetchImpl = async () => scenesPayload("기본");
    await fetchScenes({ baseUrl: "https://x", fetchImpl });
    expect(getVoiceCoverage().tolkien.complete).toBe(true);
  });

  it("fetchScenesForRun 은 완비된 문체를 골라 그 본문을 돌려준다", async () => {
    const urls = [];
    const fetchImpl = async (u) => {
      urls.push(u);
      return scenesPayload(u.includes("voice=tolkien") ? "톨킨 본문" : "기본 본문");
    };
    const out = await fetchScenesForRun({
      baseUrl: "https://x", fetchImpl,
      storage: { getItem: () => null, setItem: () => {} },
      rnd: () => 0.99, // tolkien 이 뽑히도록
    });
    expect(out.voice).toBe("tolkien");
    expect(out.scenes.kael_infirmary.body[0]).toBe("톨킨 본문");
    expect(urls.length).toBe(2); // 커버리지 확보용 1 회 + 선택 문체 1 회
  });

  it("기본 문체가 뽑히면 두 번 받지 않는다", async () => {
    const urls = [];
    const fetchImpl = async (u) => { urls.push(u); return scenesPayload("기본 본문"); };
    const out = await fetchScenesForRun({
      baseUrl: "https://x", fetchImpl,
      storage: { getItem: () => null, setItem: () => {} },
      rnd: () => 0, // default 가 뽑히도록
    });
    expect(out.voice).toBe("default");
    expect(urls.length).toBe(1);
  });
});

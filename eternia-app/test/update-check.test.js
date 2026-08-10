import { describe, it, expect } from "vitest";
import {
  parseVersion,
  isNewerVersion,
  pickApkAsset,
  checkForUpdate,
} from "../src/update-check.js";

describe("parseVersion", () => {
  it("v 접두사를 떼고 숫자 배열로", () => {
    expect(parseVersion("v1.0.13")).toEqual([1, 0, 13]);
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
  });
  it("숫자가 아닌 조각은 0", () => {
    expect(parseVersion("1.x.3")).toEqual([1, 0, 3]);
  });
  it("빈 값은 빈 배열 취급", () => {
    expect(parseVersion("")).toEqual([0]);
    expect(parseVersion(null)).toEqual([0]);
  });
});

describe("isNewerVersion", () => {
  it("패치가 오르면 새 버전", () => {
    expect(isNewerVersion("1.0.14", "1.0.13")).toBe(true);
  });
  it("같으면 아님", () => {
    expect(isNewerVersion("1.0.13", "1.0.13")).toBe(false);
  });
  it("낮으면 아님", () => {
    expect(isNewerVersion("1.0.12", "1.0.13")).toBe(false);
  });
  it("문자열 비교가 아니라 숫자 비교 (10 > 9)", () => {
    expect(isNewerVersion("1.0.10", "1.0.9")).toBe(true);
  });
  it("자릿수가 달라도 비교", () => {
    expect(isNewerVersion("1.1", "1.0.13")).toBe(true);
    expect(isNewerVersion("1.0", "1.0.0")).toBe(false);
  });
  it("v 접두사 혼용 허용", () => {
    expect(isNewerVersion("v2.0.0", "1.9.9")).toBe(true);
  });
});

describe("pickApkAsset", () => {
  const rel = { name: "app-release.apk", browser_download_url: "u-rel" };
  const dbg = { name: "app-debug.apk", browser_download_url: "u-dbg" };

  it("서명본(release)을 우선", () => {
    expect(pickApkAsset([dbg, rel])).toBe(rel);
  });
  it("release 가 없으면 아무 apk", () => {
    expect(pickApkAsset([dbg])).toBe(dbg);
  });
  it("apk 가 없으면 null", () => {
    expect(pickApkAsset([{ name: "notes.txt" }])).toBeNull();
    expect(pickApkAsset(null)).toBeNull();
  });
});

describe("checkForUpdate", () => {
  const release = {
    tag_name: "v1.0.14",
    html_url: "https://github.com/o/r/releases/tag/v1.0.14",
    assets: [
      { name: "app-debug.apk", browser_download_url: "https://x/app-debug.apk" },
      { name: "app-release.apk", browser_download_url: "https://x/app-release.apk" },
    ],
  };
  const okFetch = async () => ({ ok: true, json: async () => release });

  it("새 버전이면 다운로드 정보를 준다 (서명본 우선)", async () => {
    const r = await checkForUpdate({ currentVersion: "1.0.13", fetchImpl: okFetch });
    expect(r).toMatchObject({
      latestVersion: "1.0.14",
      currentVersion: "1.0.13",
      apkUrl: "https://x/app-release.apk",
      releaseUrl: release.html_url,
    });
  });

  it("이미 최신이면 null", async () => {
    expect(await checkForUpdate({ currentVersion: "1.0.14", fetchImpl: okFetch })).toBeNull();
  });

  it("현재 버전을 모르면(개발 빌드) 확인하지 않는다", async () => {
    let called = false;
    const spy = async () => { called = true; return { ok: true, json: async () => release }; };
    expect(await checkForUpdate({ currentVersion: "", fetchImpl: spy })).toBeNull();
    expect(called).toBe(false);
  });

  // 업데이트 확인 실패가 게임을 막으면 안 된다 — 전송 실패를 삼키는 기존 정책과 동일.
  it("응답이 실패면 조용히 null", async () => {
    const bad = async () => ({ ok: false, json: async () => ({}) });
    expect(await checkForUpdate({ currentVersion: "1.0.13", fetchImpl: bad })).toBeNull();
  });

  it("네트워크 오류도 조용히 null", async () => {
    const boom = async () => { throw new Error("offline"); };
    expect(await checkForUpdate({ currentVersion: "1.0.13", fetchImpl: boom })).toBeNull();
  });

  it("apk 자산이 없으면 릴리스 페이지로만 안내", async () => {
    const noApk = async () => ({ ok: true, json: async () => ({ ...release, assets: [] }) });
    const r = await checkForUpdate({ currentVersion: "1.0.13", fetchImpl: noApk });
    expect(r.apkUrl).toBeNull();
    expect(r.releaseUrl).toBe(release.html_url);
  });
});

import { describe, it, expect } from "vitest";
import {
  availableLandmarks, isLandmarkAvailable, TOWN_LANDMARKS,
} from "./town-config";

describe("availableLandmarks — 사이즈/환경 매트릭스", () => {
  it("Hamlet/Plains 은 5 종 (inn, smithy, tavern, herbalist, graveyard)", () => {
    const got = availableLandmarks("hamlet", "plains").sort();
    expect(got).toEqual(["graveyard", "herbalist", "inn", "smithy", "tavern"].sort());
  });

  it("Hamlet/Coastal 은 5 + docks = 6 종", () => {
    const got = availableLandmarks("hamlet", "coastal");
    expect(got).toContain("docks");
    expect(got.length).toBe(6);
  });

  it("Village/Plains 은 Hamlet 5 + temple/guard/market/jail/guild = 10 종", () => {
    const got = availableLandmarks("village", "plains").sort();
    expect(got).toEqual([
      "graveyard", "guard", "guild", "herbalist", "inn", "jail", "market",
      "smithy", "tavern", "temple",
    ].sort());
  });

  it("Village/Coastal 은 10 + docks = 11 종", () => {
    const got = availableLandmarks("village", "coastal");
    expect(got).toContain("docks");
    expect(got.length).toBe(11);
  });

  it("Town/Plains 은 12 종 (manor/alchemist 추가, docks 제외)", () => {
    const got = availableLandmarks("town", "plains");
    expect(got).toContain("manor");
    expect(got).toContain("alchemist");
    expect(got).not.toContain("docks");
    expect(got.length).toBe(12);
  });

  it("Town/Coastal 은 모든 13 종", () => {
    const got = availableLandmarks("town", "coastal").sort();
    const all = [...TOWN_LANDMARKS].sort();
    expect(got).toEqual(all);
    expect(got.length).toBe(13);
  });

  it("Manor/Alchemist 는 Town 전용 — Hamlet/Village 에는 미노출", () => {
    expect(isLandmarkAvailable("manor", "hamlet", "plains")).toBe(false);
    expect(isLandmarkAvailable("alchemist", "village", "coastal")).toBe(false);
    expect(isLandmarkAvailable("manor", "town", "plains")).toBe(true);
    expect(isLandmarkAvailable("alchemist", "town", "plains")).toBe(true);
  });

  it("Temple/Guard/Market/Jail/Guild 는 Village+ 전용", () => {
    expect(isLandmarkAvailable("temple", "hamlet", "plains")).toBe(false);
    expect(isLandmarkAvailable("guard", "hamlet", "coastal")).toBe(false);
    expect(isLandmarkAvailable("market", "village", "plains")).toBe(true);
    expect(isLandmarkAvailable("jail", "town", "plains")).toBe(true);
    expect(isLandmarkAvailable("guild", "village", "coastal")).toBe(true);
  });

  it("Docks 는 Coastal 전용 — Plains 에서 사이즈 무관 미노출", () => {
    expect(isLandmarkAvailable("docks", "hamlet", "plains")).toBe(false);
    expect(isLandmarkAvailable("docks", "village", "plains")).toBe(false);
    expect(isLandmarkAvailable("docks", "town", "plains")).toBe(false);
    expect(isLandmarkAvailable("docks", "hamlet", "coastal")).toBe(true);
    expect(isLandmarkAvailable("docks", "town", "coastal")).toBe(true);
  });

  it("Hamlet 기본 (inn/smithy/tavern/herbalist/graveyard) 은 모든 (size, env) 에서 노출", () => {
    for (const size of ["hamlet", "village", "town"] as const) {
      for (const env of ["plains", "coastal"] as const) {
        for (const l of ["inn", "smithy", "tavern", "herbalist", "graveyard"] as const) {
          expect(isLandmarkAvailable(l, size, env)).toBe(true);
        }
      }
    }
  });
});

import { describe, it, expect } from "vitest";
import {
  availableLandmarks, isLandmarkAvailable, TOWN_LANDMARKS,
} from "./town-config";

describe("availableLandmarks — size 무관, 환경만 적용", () => {
  // A policy change: the town's size is decided automatically from (the landmark and villager counts), which made choosing
  // a size pointless. All 12 landmarks are always available - only env matters (Docks is added
  // under Coastal alone).
  it("Plains 는 12 종 (Docks 제외, size 무관)", () => {
    for (const size of ["hamlet", "village", "town"] as const) {
      const got = availableLandmarks(size, "plains");
      expect(got.length).toBe(12);
      expect(got).not.toContain("docks");
      expect(got).toContain("manor");
      expect(got).toContain("guard");
      expect(got).toContain("market");
    }
  });

  it("Coastal 는 12 + docks = 13 종 (size 무관)", () => {
    for (const size of ["hamlet", "village", "town"] as const) {
      const got = availableLandmarks(size, "coastal").sort();
      const all = [...TOWN_LANDMARKS].sort();
      expect(got).toEqual(all);
      expect(got.length).toBe(13);
    }
  });

  it("Manor/Alchemist 는 size 무관 항상 노출", () => {
    expect(isLandmarkAvailable("manor", "hamlet", "plains")).toBe(true);
    expect(isLandmarkAvailable("alchemist", "village", "coastal")).toBe(true);
    expect(isLandmarkAvailable("manor", "town", "plains")).toBe(true);
  });

  it("Temple/Guard/Market/Jail/Guild 도 size 무관 노출", () => {
    expect(isLandmarkAvailable("temple", "hamlet", "plains")).toBe(true);
    expect(isLandmarkAvailable("guard", "hamlet", "coastal")).toBe(true);
    expect(isLandmarkAvailable("market", "village", "plains")).toBe(true);
    expect(isLandmarkAvailable("jail", "town", "plains")).toBe(true);
    expect(isLandmarkAvailable("guild", "village", "coastal")).toBe(true);
  });

  it("Docks 는 Coastal 전용 — Plains 에서 size 무관 미노출", () => {
    expect(isLandmarkAvailable("docks", "hamlet", "plains")).toBe(false);
    expect(isLandmarkAvailable("docks", "village", "plains")).toBe(false);
    expect(isLandmarkAvailable("docks", "town", "plains")).toBe(false);
    expect(isLandmarkAvailable("docks", "hamlet", "coastal")).toBe(true);
    expect(isLandmarkAvailable("docks", "town", "coastal")).toBe(true);
  });
});

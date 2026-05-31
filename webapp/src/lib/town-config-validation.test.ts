import { describe, it, expect } from "vitest";
import { validateTownConfig, normalizeTownConfig } from "./town-config-validation";

const VALID = {
  size: "village",
  roads: "radial",
  wealth: "common",
  defenses: "none",
  landmarks: ["inn", "smithy"],
  fields: true,
};

describe("validateTownConfig", () => {
  it("기본 유효 입력 통과", () => {
    expect(validateTownConfig(VALID)).toEqual({ ok: true });
  });

  it("배열/객체가 아닌 본문은 실패", () => {
    expect(validateTownConfig(null).ok).toBe(false);
    expect(validateTownConfig("x").ok).toBe(false);
    expect(validateTownConfig(42).ok).toBe(false);
  });

  it("size 가 enum 외 값이면 실패", () => {
    expect(validateTownConfig({ ...VALID, size: "metropolis" }).ok).toBe(false);
  });

  it("roads/wealth/defenses 가 enum 외 값이면 실패", () => {
    expect(validateTownConfig({ ...VALID, roads: "spiral" }).ok).toBe(false);
    expect(validateTownConfig({ ...VALID, wealth: "rich" }).ok).toBe(false);
    expect(validateTownConfig({ ...VALID, defenses: "iron" }).ok).toBe(false);
  });

  it("landmarks 가 배열이 아니면 실패", () => {
    expect(validateTownConfig({ ...VALID, landmarks: "inn" }).ok).toBe(false);
  });

  it("landmarks 에 알 수 없는 값이 있으면 실패", () => {
    expect(validateTownConfig({ ...VALID, landmarks: ["inn", "tavern"] }).ok).toBe(false);
  });

  it("landmarks 중복 시 실패", () => {
    expect(validateTownConfig({ ...VALID, landmarks: ["inn", "smithy", "inn"] }).ok).toBe(false);
  });

  it("landmarks 빈 배열은 허용 (선택 사항)", () => {
    expect(validateTownConfig({ ...VALID, landmarks: [] }).ok).toBe(true);
  });

  it("landmarks 6 종 모두 선택해도 통과", () => {
    expect(validateTownConfig({
      ...VALID,
      landmarks: ["inn", "smithy", "temple", "guard", "market", "manor"],
    }).ok).toBe(true);
  });

  it("fields 가 boolean 이 아니면 실패", () => {
    expect(validateTownConfig({ ...VALID, fields: 1 }).ok).toBe(false);
    expect(validateTownConfig({ ...VALID, fields: "true" }).ok).toBe(false);
  });
});

describe("normalizeTownConfig", () => {
  it("입력값을 정규화된 TownConfig 로 복사 (landmarks 새 배열)", () => {
    const arr = ["inn", "smithy"];
    const out = normalizeTownConfig({ ...VALID, landmarks: arr });
    expect(out.landmarks).toEqual(arr);
    expect(out.landmarks).not.toBe(arr); // 새 배열
    expect(out.size).toBe("village");
    expect(out.fields).toBe(true);
  });
});

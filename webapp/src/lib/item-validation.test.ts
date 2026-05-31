import { describe, it, expect } from "vitest";
import { validateItemForCreate, validateKindFields } from "./item-validation";

function base() {
  return {
    id: "x",
    kind: "weapon",
    displayName: "x",
    glyphAscii: "/",
    glyphGameIcon: "X",
    pickupMessage: "x",
  } as Record<string, unknown>;
}

describe("validateItemForCreate — weapon random-stat 필드", () => {
  it("attackPower 단일값만 있으면 통과", () => {
    const body = { ...base(), attackPower: 5, element: null };
    expect(validateItemForCreate(body)).toEqual({ ok: true });
  });

  it("attackPowerMin/Max 모두 있고 min<=max 면 통과", () => {
    const body = { ...base(), attackPower: 5, attackPowerMin: 3, attackPowerMax: 7 };
    expect(validateItemForCreate(body)).toEqual({ ok: true });
  });

  it("attackPowerMin 만 있으면 오류 (min/max 는 짝)", () => {
    const body = { ...base(), attackPower: 5, attackPowerMin: 3 };
    const r = validateItemForCreate(body);
    expect(r.ok).toBe(false);
  });

  it("attackPowerMin > Max 면 오류", () => {
    const body = { ...base(), attackPower: 5, attackPowerMin: 8, attackPowerMax: 4 };
    const r = validateItemForCreate(body);
    expect(r.ok).toBe(false);
  });

  it("tier 1~5 통과, 0 이나 6 은 오류", () => {
    expect(validateKindFields({ attackPower: 1, tier: 1 }, "weapon").ok).toBe(true);
    expect(validateKindFields({ attackPower: 1, tier: 5 }, "weapon").ok).toBe(true);
    expect(validateKindFields({ attackPower: 1, tier: 0 }, "weapon").ok).toBe(false);
    expect(validateKindFields({ attackPower: 1, tier: 6 }, "weapon").ok).toBe(false);
    expect(validateKindFields({ attackPower: 1, tier: 2.5 }, "weapon").ok).toBe(false);
  });
});

describe("validateItemForCreate — armor random-stat 필드", () => {
  it("defenseBonus 단일값만 있으면 통과", () => {
    const body = { ...base(), kind: "armor", defenseBonus: 3 };
    expect(validateItemForCreate(body)).toEqual({ ok: true });
  });

  it("defenseBonusMin/Max + tier 모두 valid 면 통과", () => {
    const body = { ...base(), kind: "armor", defenseBonus: 3, defenseBonusMin: 2, defenseBonusMax: 5, tier: 2 };
    expect(validateItemForCreate(body)).toEqual({ ok: true });
  });

  it("defenseBonusMin > Max 면 오류", () => {
    const body = { ...base(), kind: "armor", defenseBonus: 3, defenseBonusMin: 10, defenseBonusMax: 2 };
    const r = validateItemForCreate(body);
    expect(r.ok).toBe(false);
  });
});

describe("validateItemForCreate — accessory effects 필드", () => {
  it("desc 있고 effects 누락이면 통과(빈 vec 와 동치 — 효과 없는 장식용)", () => {
    const body = { ...base(), kind: "accessory", desc: "x" };
    expect(validateItemForCreate(body)).toEqual({ ok: true });
  });

  it("desc 있고 effects 가 유효한 키 배열이면 통과", () => {
    const body = { ...base(), kind: "accessory", desc: "x", effects: ["RevealGuardVision"] };
    expect(validateItemForCreate(body)).toEqual({ ok: true });
  });

  it("desc 있고 effects 가 알 수 없는 키면 오류", () => {
    const body = { ...base(), kind: "accessory", desc: "x", effects: ["NotARealEffect"] };
    const r = validateItemForCreate(body);
    expect(r.ok).toBe(false);
  });

  it("effects 가 배열이 아니면 오류", () => {
    const body = { ...base(), kind: "accessory", desc: "x", effects: "RevealGuardVision" };
    const r = validateItemForCreate(body);
    expect(r.ok).toBe(false);
  });

  it("빈 effects 배열은 효과 없는 장식용으로 허용", () => {
    const body = { ...base(), kind: "accessory", desc: "x", effects: [] };
    expect(validateItemForCreate(body)).toEqual({ ok: true });
  });
});

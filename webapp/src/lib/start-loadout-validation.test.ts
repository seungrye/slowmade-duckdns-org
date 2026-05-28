import { describe, it, expect } from "vitest";
import { validateStartLoadout, normalizeStartLoadout } from "./start-loadout-validation";

const valid = {
  gold: 50,
  weapon: null,
  armor: null,
  items: ["sword"],
  consumables: [{ id: "health_potion", count: 10 }],
};

describe("validateStartLoadout", () => {
  it("기본 유효 본문은 통과한다", () => {
    expect(validateStartLoadout(valid).ok).toBe(true);
  });

  it("객체 아님 → 실패", () => {
    expect(validateStartLoadout(null).ok).toBe(false);
    expect(validateStartLoadout("foo").ok).toBe(false);
  });

  it("gold 음수/실수/누락 → 실패", () => {
    expect(validateStartLoadout({ ...valid, gold: -1 }).ok).toBe(false);
    expect(validateStartLoadout({ ...valid, gold: 1.5 }).ok).toBe(false);
    expect(validateStartLoadout({ ...valid, gold: "10" }).ok).toBe(false);
  });

  it("gold 0 은 허용", () => {
    expect(validateStartLoadout({ ...valid, gold: 0 }).ok).toBe(true);
  });

  it("weapon 빈 문자열 → 실패, null 은 허용", () => {
    expect(validateStartLoadout({ ...valid, weapon: "" }).ok).toBe(false);
    expect(validateStartLoadout({ ...valid, weapon: "  " }).ok).toBe(false);
    expect(validateStartLoadout({ ...valid, weapon: null }).ok).toBe(true);
    expect(validateStartLoadout({ ...valid, weapon: "sword" }).ok).toBe(true);
  });

  it("items 가 배열이 아니면 실패", () => {
    expect(validateStartLoadout({ ...valid, items: "sword" }).ok).toBe(false);
  });

  it("items 원소가 빈 문자열이면 실패", () => {
    expect(validateStartLoadout({ ...valid, items: ["", "sword"] }).ok).toBe(false);
  });

  it("consumables 가 배열 아니면 실패", () => {
    expect(validateStartLoadout({ ...valid, consumables: {} }).ok).toBe(false);
  });

  it("consumables[i].count < 1 또는 실수면 실패", () => {
    expect(validateStartLoadout({ ...valid, consumables: [{ id: "p", count: 0 }] }).ok).toBe(false);
    expect(validateStartLoadout({ ...valid, consumables: [{ id: "p", count: -1 }] }).ok).toBe(false);
    expect(validateStartLoadout({ ...valid, consumables: [{ id: "p", count: 1.5 }] }).ok).toBe(false);
  });

  it("consumables[i].id 빈 문자열이면 실패", () => {
    expect(validateStartLoadout({ ...valid, consumables: [{ id: "", count: 1 }] }).ok).toBe(false);
  });
});

describe("normalizeStartLoadout", () => {
  it("정규화 결과는 새 배열·새 객체로 분리되어 있다", () => {
    const def = normalizeStartLoadout(valid);
    expect(def.items).toEqual(["sword"]);
    expect(def.items).not.toBe(valid.items);
    expect(def.consumables[0]).not.toBe(valid.consumables[0]);
  });

  it("weapon/armor 누락 시 null 로 채워준다", () => {
    const def = normalizeStartLoadout({
      gold: 50, items: [], consumables: [],
    } as unknown as Record<string, unknown>);
    expect(def.weapon).toBeNull();
    expect(def.armor).toBeNull();
  });
});

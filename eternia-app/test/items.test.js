// #103 — 아이템 사용 규칙. 웹 reducer 의 USE_ITEM 과 같은 규칙이어야 한다.
import { describe, it, expect } from "vitest";
import { isUsableItem, applyItemUse } from "../src/items.js";

const CATALOG = {
  medical_bandage: { id: "medical_bandage", displayName: "의료용 붕대", kind: "consumable", heal: 5 },
  spirit_herb: { id: "spirit_herb", displayName: "영초", kind: "consumable", heal: 8 },
  ether_refined_water: { id: "ether_refined_water", displayName: "에테르 정제수", kind: "consumable", stigmaDelta: -3 },
  mana_stone_fragment: { id: "mana_stone_fragment", displayName: "마력석 파편", kind: "consumable", stigmaDelta: 5 },
  sylvan_bow: { id: "sylvan_bow", displayName: "정령 활", kind: "weapon", attack: 3 },
};

const char = (over = {}) => ({
  stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
  hp: 50, maxHp: 100, ability: "none", stigmaErosion: 20,
  inventory: ["medical_bandage", "sylvan_bow"], flags: {}, ...over,
});

describe("isUsableItem", () => {
  it("consumable 만 쓸 수 있다", () => {
    expect(isUsableItem(CATALOG.medical_bandage)).toBe(true);
    expect(isUsableItem(CATALOG.sylvan_bow)).toBe(false);
    expect(isUsableItem(undefined)).toBe(false);
  });
});

describe("applyItemUse", () => {
  it("HP 를 회복하고 소지품에서 뺀다", () => {
    const out = applyItemUse(char(), CATALOG.medical_bandage);
    expect(out.character.hp).toBe(55);
    expect(out.character.inventory).toEqual(["sylvan_bow"]);
    expect(out.log).toContain("+5 HP");
  });

  it("maxHp 를 넘지 않는다", () => {
    const out = applyItemUse(char({ hp: 98, inventory: ['spirit_herb'] }), CATALOG.spirit_herb);
    expect(out.character.hp).toBe(100);
  });

  it("침식을 낮춘다", () => {
    const out = applyItemUse(char({ inventory: ["ether_refined_water"] }), CATALOG.ether_refined_water);
    expect(out.character.stigmaErosion).toBe(17);
    expect(out.log).toContain("침식");
  });

  it("침식을 올리는 아이템도 있다", () => {
    const out = applyItemUse(char({ inventory: ["mana_stone_fragment"] }), CATALOG.mana_stone_fragment);
    expect(out.character.stigmaErosion).toBe(25);
  });

  // 같은 아이템을 여러 개 가졌으면 하나만 준다.
  it("같은 아이템이 둘이면 하나만 소모", () => {
    const out = applyItemUse(char({ inventory: ["medical_bandage", "medical_bandage"] }), CATALOG.medical_bandage);
    expect(out.character.inventory).toEqual(["medical_bandage"]);
  });

  it("안 가진 아이템은 아무것도 바꾸지 않는다", () => {
    const c = char({ inventory: [] });
    const out = applyItemUse(c, CATALOG.medical_bandage);
    expect(out.character).toBe(c);
    expect(out.log).toBeNull();
  });

  it("consumable 이 아니면 아무것도 바꾸지 않는다", () => {
    const c = char();
    const out = applyItemUse(c, CATALOG.sylvan_bow);
    expect(out.character).toBe(c);
  });

  it("원본 캐릭터를 변형하지 않는다", () => {
    const c = char();
    applyItemUse(c, CATALOG.medical_bandage);
    expect(c.hp).toBe(50);
    expect(c.inventory).toEqual(["medical_bandage", "sylvan_bow"]);
  });
});

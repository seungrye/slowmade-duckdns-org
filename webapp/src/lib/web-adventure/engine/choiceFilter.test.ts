// choiceFilter — isChoiceAvailable / getUnavailableReason 단위 (#300).

import { describe, it, expect } from "vitest";
import { isChoiceAvailable, getUnavailableReason } from "./choiceFilter";
import type { Character, Choice } from "@/types/web-adventure";

function makeChar(partial: Partial<Character> = {}): Character {
  return {
    stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: 10,
    maxHp: 10,
    ability: "lunar",
    protagonist: "kael",
    stigmaErosion: 0,
    inventory: [],
    flags: {},
    rerollsLeft: 0,
    ...partial,
  };
}

const PLAIN: Choice = { kind: "plain", id: "p", label: "plain", to: "next" };
const PROB: Choice = {
  kind: "probability",
  id: "pr",
  label: "prob",
  stat: "str",
  difficulty: 12,
  onSuccess: "ok",
  onFailure: "no",
};

describe("isChoiceAvailable", () => {
  it("plain — 항상 사용 가능", () => {
    expect(isChoiceAvailable(PLAIN, makeChar())).toBe(true);
  });

  it("probability — 항상 사용 가능", () => {
    expect(isChoiceAvailable(PROB, makeChar())).toBe(true);
  });

  it("conditional minStat — 충족 시 true", () => {
    const c: Choice = {
      kind: "conditional",
      id: "c",
      label: "c",
      condition: { kind: "minStat", stat: "int", min: 5 },
      to: "next",
    };
    expect(isChoiceAvailable(c, makeChar({ stats: { str: 0, dex: 0, int: 5, cha: 0, con: 0, wis: 0 } }))).toBe(true);
  });

  it("conditional minStat — 미달 시 false", () => {
    const c: Choice = {
      kind: "conditional",
      id: "c",
      label: "c",
      condition: { kind: "minStat", stat: "int", min: 7 },
      to: "next",
    };
    expect(isChoiceAvailable(c, makeChar())).toBe(false);
  });

  it("conditional hasItem — 인벤에 있으면 true", () => {
    const c: Choice = {
      kind: "conditional",
      id: "c",
      label: "c",
      condition: { kind: "hasItem", itemId: "ether_refined_water" },
      to: "next",
    };
    expect(isChoiceAvailable(c, makeChar({ inventory: ["ether_refined_water"] }))).toBe(true);
    expect(isChoiceAvailable(c, makeChar({ inventory: [] }))).toBe(false);
  });

  it("conditional flag — 기본 expect=true 일치 시 true", () => {
    const c: Choice = {
      kind: "conditional",
      id: "c",
      label: "c",
      condition: { kind: "flag", key: "knowsAscensionPlot" },
      to: "next",
    };
    expect(isChoiceAvailable(c, makeChar({ flags: { knowsAscensionPlot: true } }))).toBe(true);
    expect(isChoiceAvailable(c, makeChar({ flags: {} }))).toBe(false);
  });
});

describe("getUnavailableReason", () => {
  it("plain → null (사유 없음)", () => {
    expect(getUnavailableReason(PLAIN, makeChar())).toBeNull();
  });

  it("probability → null", () => {
    expect(getUnavailableReason(PROB, makeChar())).toBeNull();
  });

  it("minStat 미달 — 한국어 stat 라벨 + 필요 수치", () => {
    const c: Choice = {
      kind: "conditional",
      id: "c",
      label: "c",
      condition: { kind: "minStat", stat: "wis", min: 8 },
      to: "next",
    };
    const reason = getUnavailableReason(c, makeChar());
    expect(reason).toMatch(/지혜.*8/);
  });

  it("hasItem 미달 — 아이템 displayName 포함", () => {
    const c: Choice = {
      kind: "conditional",
      id: "c",
      label: "c",
      condition: { kind: "hasItem", itemId: "ether_refined_water" },
      to: "next",
    };
    const reason = getUnavailableReason(c, makeChar());
    expect(reason).toMatch(/정제수|ether/);
  });
});

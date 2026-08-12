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

// ── #99 stigmaAtMost — 「침식이 적을 것」 조건 ──────────────────────────────
//
// 왜 필요한가: 조건에 하한(stigmaAtLeast)만 있어서 "표식 없는 맨살" 같은 서술을 지킬 수
// 없었다. 성흔 능력(ability)과 침식도는 별개 축이라, 침식 80 인 카엘도 능력만 「무흔」이면
// 그 선택지를 골랐다.
describe("stigmaAtMost (#99)", () => {
  const choice = (max: number): Choice => ({
    kind: "conditional",
    id: "c",
    label: "무흔",
    to: "next",
    condition: { kind: "stigmaAtMost", max },
  });

  it("침식이 max 이하면 고를 수 있다", () => {
    expect(isChoiceAvailable(choice(20), makeChar({ stigmaErosion: 0 }))).toBe(true);
    expect(isChoiceAvailable(choice(20), makeChar({ stigmaErosion: 20 }))).toBe(true);
  });

  it("침식이 max 를 넘으면 막힌다", () => {
    expect(isChoiceAvailable(choice(20), makeChar({ stigmaErosion: 21 }))).toBe(false);
    expect(isChoiceAvailable(choice(20), makeChar({ stigmaErosion: 80 }))).toBe(false);
  });

  it("막힌 이유를 사람 말로 알려 준다", () => {
    const reason = getUnavailableReason(choice(20), makeChar({ stigmaErosion: 80 }));
    expect(reason).toContain("20");
  });

  // 실제 쓰임 — 무흔 능력이면서 침식도 낮아야 한다.
  it("ability=none 과 함께 AND 로 묶인다", () => {
    const both: Choice = {
      kind: "conditional",
      id: "c",
      label: "무흔",
      to: "next",
      condition: {
        kind: "all",
        conditions: [
          { kind: "ability", required: "none" },
          { kind: "stigmaAtMost", max: 20 },
        ],
      },
    };
    expect(isChoiceAvailable(both, makeChar({ ability: "none", stigmaErosion: 0 }))).toBe(true);
    // 능력은 무흔인데 몸에는 결정이 돋아 있는 경우 — 종전에는 통과했다.
    expect(isChoiceAvailable(both, makeChar({ ability: "none", stigmaErosion: 80 }))).toBe(false);
    expect(isChoiceAvailable(both, makeChar({ ability: "lunar", stigmaErosion: 0 }))).toBe(false);
  });
});

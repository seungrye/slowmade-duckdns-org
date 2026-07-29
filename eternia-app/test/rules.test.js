import { describe, it, expect } from "vitest";
import {
  abilityBonus, rollD20, rollProbability, estimateSuccessPercent,
  stigmaDebuff, clampStigma, isFullyPetrified, isDead, rollStat, evalCondition,
} from "../src/rules.js";

function char(over = {}) {
  return {
    stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    inventory: [], flags: {}, stigmaErosion: 0, ability: "none", hp: 4, maxHp: 4,
    ...over,
  };
}

describe("abilityBonus", () => {
  it("성흔-스탯 일치 시 +2", () => {
    expect(abilityBonus("lunar", "int")).toBe(2);
    expect(abilityBonus("selene", "str")).toBe(2);
    expect(abilityBonus("hecate", "cha")).toBe(2);
  });
  it("불일치/무흔은 0", () => {
    expect(abilityBonus("lunar", "str")).toBe(0);
    expect(abilityBonus("none", "int")).toBe(0);
  });
});

describe("rollD20 / rollProbability", () => {
  it("rng 0.95 → d20 20", () => {
    expect(rollD20(() => 0.95)).toBe(20);
  });
  it("rng 1.0 은 안전 클램프(20 이하)", () => {
    expect(rollD20(() => 1)).toBeLessThanOrEqual(20);
  });
  it("total = stat + roll + 성흔보정, ≥ 난이도면 성공", () => {
    const r = rollProbability({ stat: 5, ability: "lunar", statKey: "int", difficulty: 27, rng: () => 0.95 });
    expect(r.roll).toBe(20);
    expect(r.bonus).toBe(2);
    expect(r.total).toBe(27); // 5 + 20 + 2
    expect(r.success).toBe(true);
  });
  it("난이도 초과면 실패", () => {
    const r = rollProbability({ stat: 5, ability: "none", statKey: "int", difficulty: 26, rng: () => 0.95 });
    expect(r.total).toBe(25);
    expect(r.success).toBe(false);
  });
});

describe("estimateSuccessPercent", () => {
  it("stat10 none diff15 → r≥5 (16/20=80%)", () => {
    expect(estimateSuccessPercent({ stat: 10, ability: "none", statKey: "int", difficulty: 15 })).toBe(80);
  });
  it("성흔 보정이 확률을 높인다", () => {
    const base = estimateSuccessPercent({ stat: 10, ability: "none", statKey: "int", difficulty: 15 });
    const buffed = estimateSuccessPercent({ stat: 10, ability: "lunar", statKey: "int", difficulty: 15 });
    expect(buffed).toBeGreaterThan(base);
  });
});

describe("stigma", () => {
  it("침식 <50 은 디버프 0", () => {
    expect(stigmaDebuff(49, "con")).toBe(0);
  });
  it("침식 ≥50 은 con/dex 만 -2", () => {
    expect(stigmaDebuff(50, "con")).toBe(-2);
    expect(stigmaDebuff(80, "dex")).toBe(-2);
    expect(stigmaDebuff(80, "str")).toBe(0);
  });
  it("clampStigma 는 [0,100] + NaN 방어", () => {
    expect(clampStigma(90, 20)).toBe(100);
    expect(clampStigma(10, -30)).toBe(0);
    expect(clampStigma(NaN, 5)).toBe(5);
    expect(clampStigma(50, NaN)).toBe(50);
  });
  it("isFullyPetrified / isDead", () => {
    expect(isFullyPetrified(char({ stigmaErosion: 100 }))).toBe(true);
    expect(isFullyPetrified(char({ stigmaErosion: 99 }))).toBe(false);
    expect(isDead(char({ hp: 0 }))).toBe(true);
    expect(isDead(char({ hp: 1 }))).toBe(false);
  });
  it("rollStat = base + 침식 디버프", () => {
    expect(rollStat(char({ stigmaErosion: 60, stats: { con: 7 } }), "con")).toBe(5); // 7 - 2
    expect(rollStat(char({ stigmaErosion: 60, stats: { str: 7 } }), "str")).toBe(7);
  });
});

describe("evalCondition", () => {
  it("minStat (침식 디버프 반영)", () => {
    expect(evalCondition({ kind: "minStat", stat: "int", min: 5 }, char())).toBe(true);
    expect(evalCondition({ kind: "minStat", stat: "con", min: 5 }, char({ stigmaErosion: 60 }))).toBe(false); // 5-2=3
  });
  it("hasItem", () => {
    expect(evalCondition({ kind: "hasItem", itemId: "torch" }, char({ inventory: ["torch"] }))).toBe(true);
    expect(evalCondition({ kind: "hasItem", itemId: "torch" }, char())).toBe(false);
  });
  it("flag (expect 반전)", () => {
    expect(evalCondition({ kind: "flag", key: "a" }, char({ flags: { a: true } }))).toBe(true);
    expect(evalCondition({ kind: "flag", key: "a", expect: false }, char({ flags: {} }))).toBe(true);
    expect(evalCondition({ kind: "flag", key: "a", expect: false }, char({ flags: { a: true } }))).toBe(false);
  });
  it("minFlag (카운터)", () => {
    expect(evalCondition({ kind: "minFlag", key: "n", min: 2 }, char({ flags: { n: 3 } }))).toBe(true);
    expect(evalCondition({ kind: "minFlag", key: "n", min: 2 }, char({ flags: { n: 1 } }))).toBe(false);
  });
  it("ability / stigmaAtLeast", () => {
    expect(evalCondition({ kind: "ability", required: "lunar" }, char({ ability: "lunar" }))).toBe(true);
    expect(evalCondition({ kind: "stigmaAtLeast", min: 50 }, char({ stigmaErosion: 60 }))).toBe(true);
  });
  it("all (AND)", () => {
    const cond = { kind: "all", conditions: [{ kind: "minStat", stat: "int", min: 5 }, { kind: "flag", key: "a" }] };
    expect(evalCondition(cond, char({ flags: { a: true } }))).toBe(true);
    expect(evalCondition(cond, char({ flags: {} }))).toBe(false);
  });
});

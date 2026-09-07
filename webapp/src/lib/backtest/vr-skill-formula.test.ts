import { describe, it, expect } from "vitest";
import {
  updateVBasic, updateVSkill, formulaOf, advanceCycleVR, bandOf, seedVR,
} from "./value-rebalancing";
import type { ValueRebalancingConfig } from "./types";

/**
 * The skill formula - reproducing the relay tables in the 2025 VR lecture write-up (#358).
 *
 * The implementation only ever had the basic formula (`V1 + Pool/G + CF`), and its own comment said the skill
 * formula's equation was undocumented and only a placeholder was reserved. The document gives that equation.
 *
 *   V2 = V1 + Pool/G + (E - V1)/(2 sqrt(G)) +/- the contribution      (E = the stock valuation at the cycle's end)
 *
 * The correction term **pulls the target path V toward the actual valuation.** In a decline it raises V less, so it
 * buys less and preserves the Pool; in a rise it raises V more, so it sells less. The basic formula raises V
 * mechanically regardless of the market, so a long decline burns through the Pool and V stalls - the hold-on mode.
 */
const 중계표 = [
  { 이름: "6기 1주차",  V1: 54.14,   pool: 45.86,  G: 10, E: 54.14,   cf: 100, V2: 158.73,  lo: 134.92,  hi: 182.54 },
  { 이름: "6기 33주차", V1: 1897.59, pool: 275.79, G: 10, E: 1796.25, cf: 100, V2: 2009.15, lo: 1707.78, hi: 2310.52 },
  { 이름: "4기 87주차", V1: 6014.57, pool: 882.22, G: 11, E: 6049.45, cf: 100, V2: 6200.03, lo: 5270.03, hi: 7130.03 },
];

describe("실력공식이 문서 중계표를 재현한다 (#358)", () => {
  it.each(중계표)("$이름 — V 를 맞춘다", ({ V1, pool, G, E, cf, V2 }) => {
    expect(updateVSkill(V1, pool, G, cf, E)).toBeCloseTo(V2, 1);
  });

  it.each(중계표)("$이름 — 밴드 ±15%", ({ V2, lo, hi }) => {
    const b = bandOf(V2, 0.15);
    expect(b.low).toBeCloseTo(lo, 1);
    expect(b.high).toBeCloseTo(hi, 1);
  });

  it("기본공식은 평가금이 목표와 다른 주차를 못 맞춘다", () => {
    // Only week 1, where E = V1, happens to match. That is why this went unnoticed.
    expect(updateVBasic(54.14, 45.86, 10, 100)).toBeCloseTo(158.73, 1);
    expect(Math.abs(updateVBasic(1897.59, 275.79, 10, 100) - 2009.15)).toBeGreaterThan(15);
  });
});

describe("보정항의 방향 (#358)", () => {
  it("평가금이 목표보다 낮으면 V 를 덜 올린다 — 하락장에서 Pool 을 아낀다", () => {
    const 기본 = updateVBasic(1000, 200, 10, 0);
    const 실력 = updateVSkill(1000, 200, 10, 0, 600); // the valuation is 400 below the target
    expect(실력).toBeLessThan(기본);
  });

  it("평가금이 목표보다 높으면 V 를 더 올린다 — 상승장에서 덜 판다", () => {
    expect(updateVSkill(1000, 200, 10, 0, 1400)).toBeGreaterThan(updateVBasic(1000, 200, 10, 0));
  });

  it("평가금이 목표와 같으면 기본공식과 같다", () => {
    expect(updateVSkill(1000, 200, 10, 50, 1000)).toBeCloseTo(updateVBasic(1000, 200, 10, 50), 6);
  });

  it("G 가 클수록 보정이 약하다 — 2√G 로 나눈다", () => {
    const 차 = (G: number) => Math.abs(updateVSkill(1000, 0, G, 0, 600) - 1000);
    expect(차(40)).toBeLessThan(차(10));
  });
});

const CFG: ValueRebalancingConfig = {
  principal: 10_000, gradient: 10, bandPct: 0.15, poolLimitPct: 0.5,
  cycleDays: 10, initStockRatio: 0.85, cashflow: 0,
};

describe("설정 (#358)", () => {
  it("안 적으면 실력공식이다", () => {
    expect(formulaOf(CFG)).toBe("skill");
  });

  it("적으면 그 값이 이긴다 — 예전 설정을 그대로 굴릴 수 있다", () => {
    expect(formulaOf({ ...CFG, formula: "basic" })).toBe("basic");
    expect(formulaOf({ ...CFG, formula: "skill" })).toBe("skill");
  });

  it("사이클 경계가 평가금을 반영한다", () => {
    const st = { ...seedVR(CFG, 100), V: 1000, pool: 200, qty: 6 };
    // valuation = 6 shares x 100 = 600 < V (1000) -> the skill formula sets V lower than the basic one.
    const 실력 = advanceCycleVR(st, CFG, 100);
    const 기본 = advanceCycleVR(st, { ...CFG, formula: "basic" }, 100);
    expect(실력.V).toBeLessThan(기본.V);
  });
});

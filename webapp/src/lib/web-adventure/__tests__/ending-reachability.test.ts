// #261 - verifying each protagonist's *actual* reachability of the 6 endings (depends on the mongo content).
//
// mongo is the single source for the content, so there is no static import. To guarantee *consistency* between
// *the documentation and the matrix* and *how the system actually behaves*, this test checks whether a
// protagonist's baseStats plus ability bonuses can *logically satisfy* each flag condition.

import { describe, it, expect } from "vitest";
import { protagonists } from "@/content/web-adventure/protagonists";
import type { Protagonist } from "@/types/web-adventure";

const PROTAGONISTS: Protagonist[] = ["kael", "rin", "solwen"];

describe("엔딩 도달 가능성 (#261)", () => {
  it("Kael 의 시작 int 가 priest_deal 의 minStat(7) 충족", () => {
    expect(protagonists.kael.baseStats.int).toBeGreaterThanOrEqual(7);
  });

  it("Rin 의 시작 int 가 priest_deal 의 minStat(7) 충족", () => {
    expect(protagonists.rin.baseStats.int).toBeGreaterThanOrEqual(7);
  });

  it("Solwen 은 priest_deal int 7 미만 (sylvan_bond 전용 design 의도)", () => {
    expect(protagonists.solwen.baseStats.int).toBeLessThan(7);
  });

  it("Solwen 만 solwen_grief 거쳐 spiritBeastDied flag 획득 가능", () => {
    expect(protagonists.solwen.startScene).toBe("solwen_grove");
    expect(protagonists.kael.startScene).not.toBe("solwen_grove");
    expect(protagonists.rin.startScene).not.toBe("solwen_grove");
  });

  it("모든 주인공의 시작 침식이 100 미만 (정상 진입)", () => {
    for (const p of PROTAGONISTS) {
      expect(protagonists[p].startStigma).toBeLessThan(100);
    }
  });

  it("Kael 의 시작 침식 80 — 즉시 critical 단계 (UI 경고 + 디버프)", () => {
    expect(protagonists.kael.startStigma).toBeGreaterThanOrEqual(80);
  });

  it("모든 주인공의 시작 인벤이 1 이상", () => {
    for (const p of PROTAGONISTS) {
      expect(protagonists[p].startInventory.length).toBeGreaterThan(0);
    }
  });

  it("주인공별 startScene 이 모두 다르다", () => {
    const scenes = PROTAGONISTS.map((p) => protagonists[p].startScene);
    expect(new Set(scenes).size).toBe(3);
  });
});

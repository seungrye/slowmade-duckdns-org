// #289 hydrateCharacterSnapshot 단위 테스트.

import { describe, it, expect } from "vitest";
import { hydrateCharacterSnapshot } from "./hydrate-character";

describe("hydrateCharacterSnapshot (#289)", () => {
  it("완전한 character 는 그대로 보존", () => {
    const input = {
      stats: { str: 7, dex: 7, int: 7, cha: 7, con: 7, wis: 7 },
      hp: 24,
      maxHp: 24,
      ability: "lunar",
      protagonist: "rin",
      stigmaErosion: 30,
      inventory: ["ether_refined_water"],
      flags: { knowsAscensionPlot: true },
      rerollsLeft: 2,
    };
    const out = hydrateCharacterSnapshot(input);
    expect(out.protagonist).toBe("rin");
    expect(out.stigmaErosion).toBe(30);
    expect(out.inventory).toEqual(["ether_refined_water"]);
  });

  it("옛 데이터 — protagonist 누락 시 'kael' 보정", () => {
    const old = {
      stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
      hp: 10, maxHp: 10, ability: "scholar",
      inventory: [], flags: {}, rerollsLeft: 3,
    };
    const out = hydrateCharacterSnapshot(old);
    expect(out.protagonist).toBe("kael");
  });

  it("옛 데이터 — stigmaErosion 누락 시 0 보정", () => {
    const old = {
      stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
      hp: 10, maxHp: 10, ability: "scholar", protagonist: "kael",
      inventory: [], flags: {}, rerollsLeft: 3,
    };
    expect(hydrateCharacterSnapshot(old).stigmaErosion).toBe(0);
  });

  it("undefined 입력 → 기본 character 반환 (kael / 0 / 빈 인벤)", () => {
    const out = hydrateCharacterSnapshot(undefined);
    expect(out.protagonist).toBe("kael");
    expect(out.stigmaErosion).toBe(0);
    expect(out.inventory).toEqual([]);
    expect(out.ability).toBe("none");
    expect(out.hp).toBe(10);
  });

  it("부분적 필드 누락 — 각 default 적용", () => {
    const partial = { protagonist: "solwen" };
    const out = hydrateCharacterSnapshot(partial);
    expect(out.protagonist).toBe("solwen");
    expect(out.stats).toEqual({ str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 });
  });

  // #290 — NaN/Infinity 차단.
  it.each([
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
  ])("stigmaErosion 이 %s 면 0 으로 보정", (_, value) => {
    const broken = { protagonist: "kael", stigmaErosion: value };
    expect(hydrateCharacterSnapshot(broken).stigmaErosion).toBe(0);
  });

  it("hp/maxHp/rerollsLeft 도 NaN 차단", () => {
    const broken = { hp: NaN, maxHp: NaN, rerollsLeft: NaN };
    const out = hydrateCharacterSnapshot(broken);
    expect(out.hp).toBe(10);
    expect(out.maxHp).toBe(10);
    expect(out.rerollsLeft).toBe(0);
  });
});

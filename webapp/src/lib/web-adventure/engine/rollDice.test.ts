// rollProbability 의 d20 + 스탯 + 어빌리티 보정 단위 테스트.

import { describe, test, expect } from "vitest";
import { rollProbability } from "./rollDice";

describe("rollProbability", () => {
  test("d20 굴림이 1~20 범위 안에 있다", () => {
    for (let i = 0; i < 100; i++) {
      const r = rollProbability({ stat: 5, ability: "lunar", statKey: "int", difficulty: 12 });
      expect(r.roll).toBeGreaterThanOrEqual(1);
      expect(r.roll).toBeLessThanOrEqual(20);
    }
  });

  test("루나 성흔(lunar)은 지능 판정에 +2 보정을 더한다", () => {
    const fixedRng = () => 0.5; // d20 = 11 (floor(0.5*20)+1)
    const r = rollProbability({
      stat: 5,
      ability: "lunar",
      statKey: "int",
      difficulty: 12,
      rng: fixedRng,
    });
    expect(r.bonus).toBe(2);
    expect(r.total).toBe(5 + 11 + 2);
    expect(r.success).toBe(true);
  });

  test("루나 성흔은 힘 판정엔 보정 없음", () => {
    const fixedRng = () => 0.5;
    const r = rollProbability({
      stat: 5,
      ability: "lunar",
      statKey: "str",
      difficulty: 12,
      rng: fixedRng,
    });
    expect(r.bonus).toBe(0);
  });

  test("셀레네 성흔(selene)은 힘 판정에 +2 보정을 더한다", () => {
    const fixedRng = () => 0.5;
    const r = rollProbability({
      stat: 5,
      ability: "selene",
      statKey: "str",
      difficulty: 12,
      rng: fixedRng,
    });
    expect(r.bonus).toBe(2);
  });

  test("헤카테 성흔(hecate)은 카리스마 판정에 +2 보정을 더한다", () => {
    const fixedRng = () => 0.5;
    const r = rollProbability({
      stat: 5,
      ability: "hecate",
      statKey: "cha",
      difficulty: 12,
      rng: fixedRng,
    });
    expect(r.bonus).toBe(2);
  });

  test("무흔(none)은 어떤 판정에도 보정 없음", () => {
    const fixedRng = () => 0.5;
    const r = rollProbability({
      stat: 5,
      ability: "none",
      statKey: "str",
      difficulty: 12,
      rng: fixedRng,
    });
    expect(r.bonus).toBe(0);
  });

  test("난이도 100 이면 어떤 굴림도 실패", () => {
    for (let i = 0; i < 100; i++) {
      const r = rollProbability({ stat: 10, ability: "none", statKey: "str", difficulty: 100 });
      expect(r.success).toBe(false);
    }
  });

  test("난이도 0 이면 어떤 굴림도 성공", () => {
    for (let i = 0; i < 100; i++) {
      const r = rollProbability({ stat: 5, ability: "none", statKey: "str", difficulty: 0 });
      expect(r.success).toBe(true);
    }
  });

  test("rng=0 이면 d20=1, rng→1 직전이면 d20=20", () => {
    expect(
      rollProbability({ stat: 0, ability: "none", statKey: "str", difficulty: 1, rng: () => 0 }).roll,
    ).toBe(1);
    expect(
      rollProbability({
        stat: 0,
        ability: "none",
        statKey: "str",
        difficulty: 1,
        rng: () => 0.9999,
      }).roll,
    ).toBe(20);
  });
});

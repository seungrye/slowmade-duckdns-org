// 무흔(none)의 침식 면역 (#421).
//
// 설정(`content/web-adventure/abilities.ts`)은 "성흔이 없어 석화 면역" 이라고 말하는데
// 코드가 그렇지 않았다 — `isFullyPetrified` 도 `applyStigmaDelta` 도 ability 를 안 봐서,
// 무흔으로 플레이해도 환경 침식이 그대로 쌓이고 100 에 닿으면 굳었다.
//
// 여기서 그 약속을 못 박는다. 마력을 거절한 자에게는 새길 성흔이 없다.

import { describe, it, expect } from "vitest";
import { applyStigmaDelta, isFullyPetrified, STIGMA_MAX } from "./stigma";
import type { AbilityKey, Character } from "@/types/web-adventure";

function who(ability: AbilityKey, stigmaErosion: number): Character {
  return {
    stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: 10,
    maxHp: 10,
    ability,
    protagonist: "kael",
    stigmaErosion,
    inventory: [],
    flags: {},
    rerollsLeft: 0,
  };
}

describe("무흔은 침식을 쌓지 않는다", () => {
  it("성흔 있는 자는 오른다", () => {
    expect(applyStigmaDelta(who("selene", 30), 12).stigmaErosion).toBe(42);
  });

  it("무흔은 오르지 않는다 — 마력을 거절해 새길 성흔이 없다", () => {
    expect(applyStigmaDelta(who("none", 30), 12).stigmaErosion).toBe(30);
  });

  it("무흔도 내려가는 것은 받는다 — 정제수를 못 쓸 이유는 없다", () => {
    expect(applyStigmaDelta(who("none", 30), -6).stigmaErosion).toBe(24);
  });

  it("환경 침식도 무흔에게는 붙지 않는다 — 씬 onEnter 가 이 함수를 탄다", () => {
    // seed-env-stigma 의 씬들은 ability 조건 없이 stigmaDelta 를 준다.
    // 그 경로가 결국 applyStigmaDelta 이므로 여기서 막으면 전부 막힌다.
    let c = who("none", 0);
    for (let i = 0; i < 30; i++) c = applyStigmaDelta(c, 4);
    expect(c.stigmaErosion).toBe(0);
  });
});

describe("무흔은 석화하지 않는다", () => {
  it("성흔 있는 자는 100 에서 굳는다", () => {
    expect(isFullyPetrified(who("selene", STIGMA_MAX))).toBe(true);
  });

  it("무흔은 100 이어도 굳지 않는다", () => {
    // 옛 저장값이나 이 변경 이전 회차에서 100 을 안고 들어올 수 있다.
    expect(isFullyPetrified(who("none", STIGMA_MAX))).toBe(false);
  });
});

describe("발각 석화는 그대로다", () => {
  it("무흔 면역은 *침식으로* 굳는 것만 막는다", () => {
    // kael_caught·omphalos_caught_at_gate 같은 씬은 isEnding+endingId 로 직접 끝낸다.
    // 그 경로는 isFullyPetrified 를 타지 않으므로 이 변경의 영향을 받지 않는다.
    // (운영 기록 105 건 중 103 건이 그쪽이었다 — #421 실측)
    expect(isFullyPetrified(who("none", 0))).toBe(false);
  });
});

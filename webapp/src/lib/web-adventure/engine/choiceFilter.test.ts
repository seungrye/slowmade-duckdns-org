// 조건 선택지 필터 — 사용 가능 여부와 미충족 사유 텍스트.
// TDD red 단계: 구현 전 작성.

import { describe, test, expect } from "vitest";
import type {
  AbilityKey,
  Character,
  Choice,
  StatKey,
} from "@/types/web-adventure";
import { isChoiceAvailable, getUnavailableReason } from "./choiceFilter";

function makeTestCharacter(
  overrides: Partial<Record<StatKey, number>> & {
    flags?: Record<string, boolean>;
    inventory?: string[];
  } = {},
  ability: AbilityKey = "scholar",
): Character {
  const { flags, inventory, ...statOverrides } = overrides;
  const baseStats: Record<StatKey, number> = {
    str: 5,
    dex: 5,
    int: 5,
    cha: 5,
    con: 5,
    wis: 5,
  };
  const stats: Record<StatKey, number> = { ...baseStats, ...statOverrides };
  return {
    stats,
    hp: 10,
    maxHp: 10,
    ability,
    inventory: inventory ?? [],
    flags: flags ?? {},
    rerollsLeft: 3,
  };
}

describe("isChoiceAvailable", () => {
  test("plain choice 는 항상 사용 가능", () => {
    const choice: Choice = {
      kind: "plain",
      id: "x",
      label: "...",
      to: "y",
    };
    expect(isChoiceAvailable(choice, makeTestCharacter())).toBe(true);
  });

  test("probability choice 는 항상 사용 가능 (성공/실패는 reducer 가 판정)", () => {
    const choice: Choice = {
      kind: "probability",
      id: "x",
      label: "...",
      stat: "dex",
      difficulty: 12,
      onSuccess: "a",
      onFailure: "b",
    };
    expect(isChoiceAvailable(choice, makeTestCharacter())).toBe(true);
  });

  test("conditional minStat 미충족이면 false", () => {
    const choice: Choice = {
      kind: "conditional",
      id: "x",
      label: "...",
      condition: { kind: "minStat", stat: "wis", min: 8 },
      to: "y",
    };
    const lowWis = makeTestCharacter({ wis: 5 });
    expect(isChoiceAvailable(choice, lowWis)).toBe(false);
  });

  test("conditional minStat 충족이면 true", () => {
    const choice: Choice = {
      kind: "conditional",
      id: "x",
      label: "...",
      condition: { kind: "minStat", stat: "wis", min: 8 },
      to: "y",
    };
    const highWis = makeTestCharacter({ wis: 9 });
    expect(isChoiceAvailable(choice, highWis)).toBe(true);
  });

  test("conditional flag 미충족이면 false", () => {
    const choice: Choice = {
      kind: "conditional",
      id: "x",
      label: "...",
      condition: { kind: "flag", key: "hasSecretSnack" },
      to: "y",
    };
    expect(isChoiceAvailable(choice, makeTestCharacter())).toBe(false);
  });

  test("conditional flag 충족이면 true", () => {
    const choice: Choice = {
      kind: "conditional",
      id: "x",
      label: "...",
      condition: { kind: "flag", key: "hasSecretSnack" },
      to: "y",
    };
    const c = makeTestCharacter({ flags: { hasSecretSnack: true } });
    expect(isChoiceAvailable(c.flags ? choice : choice, c)).toBe(true);
  });

  test("conditional hasItem 미충족이면 false, 충족이면 true", () => {
    const choice: Choice = {
      kind: "conditional",
      id: "x",
      label: "...",
      condition: { kind: "hasItem", itemId: "torch" },
      to: "y",
    };
    expect(isChoiceAvailable(choice, makeTestCharacter())).toBe(false);
    const withTorch = makeTestCharacter({ inventory: ["torch"] });
    expect(isChoiceAvailable(choice, withTorch)).toBe(true);
  });
});

describe("getUnavailableReason", () => {
  test("plain choice 는 null", () => {
    const choice: Choice = {
      kind: "plain",
      id: "x",
      label: "...",
      to: "y",
    };
    expect(getUnavailableReason(choice, makeTestCharacter())).toBeNull();
  });

  test("사용 가능한 conditional 은 null", () => {
    const choice: Choice = {
      kind: "conditional",
      id: "x",
      label: "...",
      condition: { kind: "minStat", stat: "wis", min: 5 },
      to: "y",
    };
    expect(getUnavailableReason(choice, makeTestCharacter())).toBeNull();
  });

  test("minStat 미충족 시 스탯명과 최소값을 포함한다", () => {
    const choice: Choice = {
      kind: "conditional",
      id: "x",
      label: "...",
      condition: { kind: "minStat", stat: "wis", min: 8 },
      to: "y",
    };
    const reason = getUnavailableReason(choice, makeTestCharacter({ wis: 5 }));
    expect(reason).not.toBeNull();
    expect(reason).toContain("지혜");
    expect(reason).toContain("8");
  });

  test("flag 미충족 시 플래그 라벨을 포함한다", () => {
    const choice: Choice = {
      kind: "conditional",
      id: "x",
      label: "...",
      condition: { kind: "flag", key: "hasSecretSnack" },
      to: "y",
    };
    const reason = getUnavailableReason(choice, makeTestCharacter());
    expect(reason).not.toBeNull();
    // hasSecretSnack 은 "비밀 간식" 으로 매핑되어야 한다.
    expect(reason).toContain("비밀 간식");
  });

  test("hasItem 미충족 시 아이템 정보 포함 (한글 라벨)", () => {
    // 3 주차: itemId 가 카탈로그에 있으면 displayName 으로 표시.
    const choice: Choice = {
      kind: "conditional",
      id: "x",
      label: "...",
      condition: { kind: "hasItem", itemId: "torch" },
      to: "y",
    };
    const reason = getUnavailableReason(choice, makeTestCharacter());
    expect(reason).not.toBeNull();
    expect(reason).toContain("횃불");
  });
});

// 조건 선택지 필터 — UI 측에서 disable/툴팁용으로, reducer 측에서도 가드용으로 사용.
//
// 책임:
//   - isChoiceAvailable: 선택지가 *지금* 사용 가능한지 (plain/probability 는 무조건 true).
//   - getUnavailableReason: 사용 불가일 때 사람 친화 라벨 (예: "지혜 8 이상 필요").
//     사용 가능하거나 plain/probability 면 null.

import type { Character, Choice, ChoiceCondition, StatKey } from "@/types/web-adventure";
import { effectiveStat } from "./stats";
import { items } from "@/content/web-adventure/items";

const STAT_LABEL_KO: Record<StatKey, string> = {
  str: "힘",
  dex: "민첩",
  int: "지능",
  cha: "카리스마",
  con: "체력",
  wis: "지혜",
};

/**
 * flag 키 → 사용자 친화 라벨. 컨텐츠가 늘어나도 fallback (key 그대로) 으로 우아하게 처리.
 * 2 주차 사용 키: hasSecretSnack / caughtBefore.
 */
const FLAG_LABEL_KO: Record<string, string> = {
  hasSecretSnack: "비밀 간식",
  caughtBefore: "이전에 들킨 적 있음",
};

function evalCondition(cond: ChoiceCondition, character: Character): boolean {
  switch (cond.kind) {
    case "minStat":
      return effectiveStat(character, cond.stat) >= cond.min;
    case "hasItem":
      return character.inventory.includes(cond.itemId);
    case "flag": {
      // 5 주차 (#221) — expect 로 반전 매치. 미정의 시 기본값 true (기존 동작 보존).
      const expected = cond.expect ?? true;
      const actual = character.flags[cond.key] === true;
      return actual === expected;
    }
    case "minFlag": {
      const v = character.flags[cond.key];
      const num = typeof v === "number" ? v : v === true ? 1 : 0;
      return num >= cond.min;
    }
    // #321 — 4 성흔.
    case "ability":
      return character.ability === cond.required;
    // #359 각성.
    case "stigmaAtLeast":
      return character.stigmaErosion >= cond.min;
    case "stigmaAtMost":
      return character.stigmaErosion <= cond.max;
    case "all":
      return cond.conditions.every((c) => evalCondition(c, character));
  }
}

export function isChoiceAvailable(choice: Choice, character: Character): boolean {
  if (choice.kind === "plain" || choice.kind === "probability") return true;
  return evalCondition(choice.condition, character);
}

/**
 * 4 주차 — 조건 선택지의 *완전 숨김 모드*.
 * 5 주차 (#221) — probability 의 hideWhenFlag 지원.
 *
 * - plain → 항상 visible.
 * - probability → hideWhenFlag 지정 시 해당 flag truthy 면 hidden, 아니면 visible.
 * - conditional + hidden=true → 조건 미충족 시 false (UI 에서 렌더 X).
 * - conditional + hidden=false/undefined → 항상 true (회색 + tooltip 처리는 UI 가 한다).
 */
export function isChoiceVisible(choice: Choice, character: Character): boolean {
  if (choice.kind === "plain") return true;
  if (choice.kind === "probability") {
    if (choice.hideWhenFlag && character.flags[choice.hideWhenFlag] === true) {
      return false;
    }
    return true;
  }
  if (!choice.hidden) return true;
  return evalCondition(choice.condition, character);
}

function reasonForCondition(c: ChoiceCondition, character: Character): string | null {
  if (evalCondition(c, character)) return null;
  switch (c.kind) {
    case "minStat":
      return `${STAT_LABEL_KO[c.stat]} ${c.min} 이상 필요`;
    case "flag": {
      const label = FLAG_LABEL_KO[c.key] ?? c.key;
      return `${label} 필요`;
    }
    case "minFlag": {
      const label = FLAG_LABEL_KO[c.key] ?? c.key;
      return `${label} ${c.min} 이상 필요`;
    }
    case "hasItem": {
      const item = items[c.itemId];
      const label = item ? item.displayName : c.itemId;
      return `아이템 필요: ${label}`;
    }
    case "ability": {
      const ABILITY_KO: Record<string, string> = {
        lunar: "루나", selene: "셀레네", hecate: "헤카테", none: "무흔",
      };
      return `성흔 필요: ${ABILITY_KO[c.required] ?? c.required}`;
    }
    // #359 각성.
    case "stigmaAtLeast":
      return `침식도 ${c.min} 이상 필요`;
    case "stigmaAtMost":
      return `침식도 ${c.max} 이하여야 함`;
    case "all": {
      const parts = c.conditions
        .map((sub) => reasonForCondition(sub, character))
        .filter((s): s is string => s !== null);
      return parts.length ? parts.join(" · ") : null;
    }
  }
}

export function getUnavailableReason(choice: Choice, character: Character): string | null {
  if (choice.kind === "plain" || choice.kind === "probability") return null;
  return reasonForCondition(choice.condition, character);
}

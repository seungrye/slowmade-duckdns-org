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
    case "flag":
      return !!character.flags[cond.key];
  }
}

export function isChoiceAvailable(choice: Choice, character: Character): boolean {
  if (choice.kind === "plain" || choice.kind === "probability") return true;
  return evalCondition(choice.condition, character);
}

export function getUnavailableReason(choice: Choice, character: Character): string | null {
  if (choice.kind === "plain" || choice.kind === "probability") return null;
  if (evalCondition(choice.condition, character)) return null;
  const c = choice.condition;
  switch (c.kind) {
    case "minStat":
      return `${STAT_LABEL_KO[c.stat]} ${c.min} 이상 필요`;
    case "flag": {
      const label = FLAG_LABEL_KO[c.key] ?? c.key;
      return `${label} 필요`;
    }
    case "hasItem": {
      const item = items[c.itemId];
      const label = item ? item.displayName : c.itemId;
      return `아이템 필요: ${label}`;
    }
  }
}

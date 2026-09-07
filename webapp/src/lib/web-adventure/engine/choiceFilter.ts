// The conditional choice filter - used by the UI for disabling and tooltips, and by the reducer as a guard.
//
// Responsibilities:
//   - isChoiceAvailable: whether the choice is usable *right now* (plain and probability are always true).
//   - getUnavailableReason: a human-friendly label when it is not ("wisdom 8 or more required", say).
//     null when usable, or for plain and probability.

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
 * A flag key -> a user-friendly label. As content grows it degrades gracefully to a fallback (the key itself).
 * The keys used in week 2: hasSecretSnack / caughtBefore.
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
      // Week 5 (#221) - an inverted match through expect. Undefined defaults to true (preserving the existing behaviour).
      const expected = cond.expect ?? true;
      const actual = character.flags[cond.key] === true;
      return actual === expected;
    }
    case "minFlag": {
      const v = character.flags[cond.key];
      const num = typeof v === "number" ? v : v === true ? 1 : 0;
      return num >= cond.min;
    }
    // #321 - the 4 stigmata.
    case "ability":
      return character.ability === cond.required;
    // #359 awakening.
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
 * Week 4 - the *fully hidden mode* for conditional choices.
 * Week 5 (#221) - hideWhenFlag support for probability.
 *
 * - plain -> always visible.
 * - probability -> with hideWhenFlag given, hidden when that flag is truthy, otherwise visible.
 * - conditional with hidden=true -> false when the condition is unmet (not rendered by the UI).
 * - conditional with hidden=false/undefined -> always true (the UI handles greying out and the tooltip).
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
    // #359 awakening.
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

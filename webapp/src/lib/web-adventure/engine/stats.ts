// 효과 스탯 — 캐릭터 base stat + passive 아이템 보너스.
//
// reducer / UI 의 확률 판정에서 모두 사용. 패시브 자동 반영을 보장.

import type { Character, StatKey } from "@/types/web-adventure";
import { items } from "@/content/web-adventure/items";

/** 패시브 아이템 보유 시 stat 보너스 합계 + base stat. */
export function effectiveStat(character: Character, stat: StatKey): number {
  const base = character.stats[stat];
  let bonus = 0;
  for (const id of character.inventory) {
    const item = items[id];
    if (!item) continue;
    if (item.kind !== "passive") continue;
    if (item.passiveStat?.stat === stat) {
      bonus += item.passiveStat.bonus;
    }
  }
  return base + bonus;
}

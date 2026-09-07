// Effective stats - the character's base stat plus passive item bonuses.
//
// Used by both the reducer's and the UI's probability checks, guaranteeing passives always apply.

import type { Character, StatKey } from "@/types/web-adventure";
import { items } from "@/content/web-adventure/items";

/** The base stat plus the total stat bonus from any passive items held. */
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

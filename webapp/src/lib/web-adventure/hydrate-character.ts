// #289 compatibility with old character snapshots - correcting protagonist and stigmaErosion.
//
// The #287 schema makes protagonist and stigmaErosion required. Data from before #258 (the old historical-drama
// content included) can lack both fields -> this stops the validation failing.

import { flagsForStore } from "./flags";

// #290 - a helper that blocks NaN and Infinity. typeof number === 'number' is true for NaN too.
function isFiniteNumber(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v);
}

export function hydrateCharacterSnapshot(raw: unknown): Record<string, unknown> {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    stats: c.stats ?? { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: isFiniteNumber(c.hp) ? (c.hp as number) : 10,
    maxHp: isFiniteNumber(c.maxHp) ? (c.maxHp as number) : 10,
    ability: typeof c.ability === "string" ? c.ability : "none",
    protagonist: typeof c.protagonist === "string" ? c.protagonist : "kael",
    // #290 - blocking NaN and Infinity (they fail the mongoose schema's 0-100 validation).
    stigmaErosion: isFiniteNumber(c.stigmaErosion) ? (c.stigmaErosion as number) : 0,
    inventory: Array.isArray(c.inventory) ? c.inventory : [],
    // #356 - the dots in world.* keys made saving fail outright. Only the values are normalised; the keys stay.
    flags: flagsForStore(c.flags),
    rerollsLeft: isFiniteNumber(c.rerollsLeft) ? (c.rerollsLeft as number) : 0,
  };
}

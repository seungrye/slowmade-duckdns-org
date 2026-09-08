// The game rules - rolls, contamination and condition evaluation (pure functions).
//
// MIRROR - webapp/src/lib/web-adventure/engine/{rollDice,stigma}.ts plus reducer.evalCondition, ported
// to the app's JS. character has the shape {stats, inventory, flags, stigmaErosion, ability, hp, maxHp}.
// Note: effectiveStat reflects the base stat only (passive item bonuses are not ported - a later slice).

export const STIGMA_MAX = 100;
export const STIGMA_DEBUFF_THRESHOLD = 50;
export const STIGMA_CRITICAL_THRESHOLD = 80;
export const INVENTORY_CAP = 8;

// -- rolls (d20 + stat + the stigma modifier vs the difficulty) --
/** The modifier per stigma ability - +2 on a matching statKey. lunar->int, selene->str, hecate->cha, none->0. */
export function abilityBonus(ability, statKey) {
  if (ability === "lunar" && statKey === "int") return 2;
  if (ability === "selene" && statKey === "str") return 2;
  if (ability === "hecate" && statKey === "cha") return 2;
  return 0;
}

/** [0,1) -> 1..20. Clamped safely even when rng returns 1.0. */
export function rollD20(rng) {
  const v = rng();
  const clamped = v >= 1 ? 0.99999 : Math.max(0, v);
  return Math.floor(clamped * 20) + 1;
}

/** @returns {{success:boolean, roll:number, bonus:number, total:number}} */
export function rollProbability(opts) {
  const rng = opts.rng || Math.random;
  const roll = rollD20(rng);
  const bonus = abilityBonus(opts.ability, opts.statKey);
  const total = opts.stat + roll + bonus;
  return { roll, bonus, total, success: total >= opts.difficulty };
}

/** The success probability (%) as an integer - for the live display. */
export function estimateSuccessPercent(opts) {
  const bonus = abilityBonus(opts.ability, opts.statKey);
  let success = 0;
  for (let r = 1; r <= 20; r++) {
    if (opts.stat + r + bonus >= opts.difficulty) success += 1;
  }
  return Math.round((success / 20) * 100);
}

// -- contamination (stigma) --
/** Contamination >= 50 gives -2 on con/dex rolls. Otherwise 0. */
export function stigmaDebuff(stigmaErosion, stat) {
  if ((stigmaErosion || 0) < STIGMA_DEBUFF_THRESHOLD) return 0;
  if (stat === "con" || stat === "dex") return -2;
  return 0;
}

/** Adds to or subtracts from the contamination, clamped to [0,100] - guarding against NaN and Infinity. */
export function clampStigma(start, delta) {
  const safeStart = Number.isFinite(start) ? start : 0;
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  return Math.max(0, Math.min(STIGMA_MAX, safeStart + safeDelta));
}

export function isFullyPetrified(character) {
  return (character.stigmaErosion || 0) >= STIGMA_MAX;
}
export function isDead(character) {
  return (character.hp || 0) <= 0;
}

/** The base stat (passive item bonuses not reflected - later). */
export function effectiveStat(character, stat) {
  return character.stats[stat] || 0;
}

/** The effective stat for a roll = the base plus the contamination debuff. */
export function rollStat(character, stat) {
  return effectiveStat(character, stat) + stigmaDebuff(character.stigmaErosion, stat);
}

// -- condition evaluation (ported from reducer.evalCondition) --
export function evalCondition(cond, character) {
  if (!cond) return true;
  switch (cond.kind) {
    case "minStat":
      return rollStat(character, cond.stat) >= cond.min;
    case "hasItem":
      return character.inventory.indexOf(cond.itemId) >= 0;
    case "flag": {
      const expected = cond.expect === undefined ? true : cond.expect;
      const actual = character.flags[cond.key] === true;
      return actual === expected;
    }
    case "minFlag": {
      const v = character.flags[cond.key];
      const num = typeof v === "number" ? v : v === true ? 1 : 0;
      return num >= cond.min;
    }
    case "ability":
      return character.ability === cond.required;
    case "stigmaAtLeast":
      return (character.stigmaErosion || 0) >= cond.min;
    case "all":
      return (cond.conditions || []).every((c) => evalCondition(c, character));
    default:
      return true; // An unknown condition is left open.
  }
}

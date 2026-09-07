// d20 plus stat plus ability bonus - the heart of the probability check.
//
// The formula:
//   total = stat + d20(roll) + abilityBonus (+2 when the ability matches the stat kind)
//   success = total >= difficulty
//
// The rng argument is Math.random()-compatible over [0, 1). Tests inject a deterministic rng.

import type { AbilityKey, StatKey } from "@/types/web-adventure";

export type RollResult = {
  success: boolean;
  /** 1..20 */
  roll: number;
  bonus: number;
  total: number;
};

export type RollOptions = {
  stat: number;
  ability: AbilityKey;
  statKey: StatKey;
  difficulty: number;
  rng?: () => number;
};

/** The bonus per stigma ability - +2 on a matching statKey, 0 otherwise. */
function abilityBonus(ability: AbilityKey, statKey: StatKey): number {
  // #253 - Eternia's 4 stigmata:
  //   lunar   -> int +2
  //   selene  -> str +2 (combat)
  //   hecate  -> cha +2 (persuasion and illusion)
  //   none    -> no magic (handled separately through rerolls, with no bonus)
  if (ability === "lunar" && statKey === "int") return 2;
  if (ability === "selene" && statKey === "str") return 2;
  if (ability === "hecate" && statKey === "cha") return 2;
  return 0;
}

/** A d20 from [0, 1) -> 1..20. */
function rollD20(rng: () => number): number {
  const v = rng();
  // A safety clamp - it blocks an rng that returns 1.0 (Math.random excludes 1; this protects against injection).
  const clamped = v >= 1 ? 0.99999 : Math.max(0, v);
  return Math.floor(clamped * 20) + 1;
}

export function rollProbability(opts: RollOptions): RollResult {
  const rng = opts.rng ?? Math.random;
  const roll = rollD20(rng);
  const bonus = abilityBonus(opts.ability, opts.statKey);
  const total = opts.stat + roll + bonus;
  return {
    roll,
    bonus,
    total,
    success: total >= opts.difficulty,
  };
}

/** For the live probability display - the success chance (%) as an integer. */
export function estimateSuccessPercent(opts: Omit<RollOptions, "rng">): number {
  const bonus = abilityBonus(opts.ability, opts.statKey);
  // The number of d20 rolls (1..20) that succeed, over 20.
  let success = 0;
  for (let r = 1; r <= 20; r++) {
    if (opts.stat + r + bonus >= opts.difficulty) success += 1;
  }
  return Math.round((success / 20) * 100);
}

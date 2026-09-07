// The Fall of Eternia's stigma contamination mechanic (#250).
//
// Mapping the external AI design:
//   0-49 : normal.
//   50-79: debuffed - con/dex checks take -2, and Selene's magic gains +3 power (handled separately in rollDice).
//   80-99: critical - the debuff continues plus a UI warning (text and colour).
//   100  : moves to the automatic petrification ending.

import type { Character, StatKey } from "@/types/web-adventure";

/** The contamination debuff threshold. */
export const STIGMA_DEBUFF_THRESHOLD = 50;
/** The critical contamination threshold (the UI warning). */
export const STIGMA_CRITICAL_THRESHOLD = 80;
/** Maximum contamination = automatic petrification. */
export const STIGMA_MAX = 100;

/**
 * At or above the threshold, con/dex checks take a -2 debuff.
 * The other stats (str/int/cha/wis) are unaffected.
 */
export function stigmaDebuff(character: Character, stat: StatKey): number {
  if (character.stigmaErosion < STIGMA_DEBUFF_THRESHOLD) return 0;
  if (stat === "con" || stat === "dex") return -2;
  return 0;
}

/**
 * Adjusts contamination, clamped to [0, 100]. It returns *a copy* of the character.
 *
 * #290 guards against NaN and Infinity - a NaN from old localStorage or corrupted input is not blocked by
 * `??` (NaN is not nullish). Math.max(0, Math.min(100, NaN)) = NaN, which would corrupt the whole character.
 * Both the start and the delta must be *finite numbers*.
 */
export function applyStigmaDelta(character: Character, delta: number): Character {
  const safeStart = Number.isFinite(character.stigmaErosion) ? character.stigmaErosion : 0;
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  const next = Math.max(0, Math.min(STIGMA_MAX, safeStart + safeDelta));
  return { ...character, stigmaErosion: next };
}

/** Contamination reaching 100 -> the automatic petrification ending. */
export function isFullyPetrified(character: Character): boolean {
  return character.stigmaErosion >= STIGMA_MAX;
}

/**
 * #318 - HP reaching 0 -> the automatic fall ending.
 * A scripted ending (caught, chase and so on) is only for *a genuinely final decision*; most game overs come from
 * accumulated HP or contamination.
 */
export function isDead(character: Character): boolean {
  return character.hp <= 0;
}

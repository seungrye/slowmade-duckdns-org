// Eternia's #256 world-flag boomerang.
//
// The previous run's endingId is injected automatically into the next run's character.flags as a *world.* flag*.
// A scene's conditional branch checks that flag and leads to a different ending, NPC or line.
//
// The injection rules (idempotent):
//   ascension     -> world.solaris_strong  (the priesthood's power grows)
//   revolution    -> world.revolution_won  (the Ironguard arms itself)
//   harmony       -> world.harmony_kept    (magic's nature is restored)
//   fall          -> world.world_fell      (every city in ashes)
//   petrification -> world.last_one_fell   (the previous count strengthens)
//   sylvan_bond   -> world.sylvan_awoke    (the spirit beast wakes)
//   liberation    -> world.truth_freed     (the stigma's truth is exposed - favouring the next run's awakening clues)
//   usurpation    -> world.false_god       (the usurper takes the divine throne - the priesthood's doctrine corrupts)
//   regency       -> world.regent_rules    (the fallen one joins the empire's elite - the power structure corrupts)
//   purge         -> world.purged          (purged - the next run's companions are wary, or absent)
//   wayfarer      -> world.wanderer        (the one who left - remembered as a rumour somewhere)

import type { EndingId } from "@/types/web-adventure";

export const ENDING_TO_WORLD_FLAG: Record<EndingId, string> = {
  ascension: "world.solaris_strong",
  revolution: "world.revolution_won",
  harmony: "world.harmony_kept",
  fall: "world.world_fell",
  petrification: "world.last_one_fell",
  sylvan_bond: "world.sylvan_awoke",
  liberation: "world.truth_freed",
  usurpation: "world.false_god",
  regency: "world.regent_rules",
  purge: "world.purged",
  wayfarer: "world.wanderer",
};

export interface PastRunForFlags {
  endingId?: EndingId | string;
}

/**
 * The list of previous runs -> a world.* flags object.
 * The same endingId appearing several times still gives one true (idempotent).
 */
export function buildWorldFlags(pastRuns: PastRunForFlags[]): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const r of pastRuns) {
    if (!r?.endingId) continue;
    const key = ENDING_TO_WORLD_FLAG[r.endingId as EndingId];
    if (key) flags[key] = true;
  }
  return flags;
}

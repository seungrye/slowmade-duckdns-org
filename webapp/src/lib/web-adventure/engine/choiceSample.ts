// Narrowing the choices shown - a scene may author up to 6 (a pool) while only 3 appear on screen.
// The 3 are drawn *deterministically* from the run (runIndex) plus the scene id, so they are fixed within a run
// (stable across reloads and re-renders, preventing reroll abuse) and differ in another run (a reason to replay).
//
// The softlock-prevention principles:
//   - "always shown (keep)": anything pinned=true, or any non-plain branch (conditional/probability).
//     -> unlocks, challenges and key branches are never hidden by the draw.
//   - Drawn from: only non-pinned plain choices (mostly flavour and side branches). They fill the remaining slots (max - keep).
//   - When keep exceeds max, all of keep is shown (a key branch is never hidden).

import type { Character, Choice } from "@/types/web-adventure";
import { isChoiceVisible } from "./choiceFilter";

/** A string -> a 32-bit non-negative hash (for the deterministic seed). The same rule as SceneRenderer's. */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * (seed, id) -> a draw score. A weak polynomial hash keeps the order of the id's trailing characters even with the
 * seed prefixed, so changing the seed does not change the ranking. Mixing the seed and id hashes multiplicatively
 * gives avalanche - so a changed seed really does rearrange the ranking.
 */
function scoreOf(seed: string, id: string): number {
  const a = hashString(seed);
  const b = hashString(id);
  let h = Math.imul(a ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(b + 0x27d4eb2f, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = h ^ (h >>> 13);
  return h >>> 0;
}

function isAlwaysShown(c: Choice): boolean {
  return c.pinned === true || c.kind !== "plain";
}

export type PickOptions = {
  /** The deterministic draw seed. Usually `${runIndex}:${sceneId}`. */
  seed: string;
  /** The display cap. 3 by default. */
  max?: number;
};

/**
 * Picks the choices to show - filtered to visible by the character's state, then drawn deterministically when over the cap.
 * The final result keeps the authored order.
 */
export function pickDisplayedChoices(
  choices: Choice[],
  character: Character,
  opts: PickOptions,
): Choice[] {
  const max = opts.max ?? 3;
  const visible = choices.filter((c) => isChoiceVisible(c, character));
  if (visible.length <= max) return visible;

  const order = new Map(visible.map((c, i) => [c.id, i]));
  const keep = visible.filter(isAlwaysShown);
  const pool = visible.filter((c) => !isAlwaysShown(c));

  const remaining = Math.max(0, max - keep.length);
  const sampled =
    remaining > 0
      ? pool
          .map((c) => ({ c, r: scoreOf(opts.seed, c.id) }))
          .sort((a, b) => (a.r - b.r) || (a.c.id < b.c.id ? -1 : 1))
          .slice(0, remaining)
          .map((x) => x.c)
      : [];

  return [...keep, ...sampled].sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
}

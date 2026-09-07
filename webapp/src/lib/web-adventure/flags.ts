/**
 * Putting character.flags into a storable shape (#356).
 *
 * #256 injects the previous run's ending into the next run's flags, and those keys contain dots
 * (`world.harmony_kept`). Two models declared flags as a `Map of Boolean`, and
 * **MongoDB cannot use dots in Map keys** - the cast failed and the whole document was never
 * saved. It broke unconditionally from the second run onward, wiping out feedback notes, the gallery and achievements.
 *
 * The keys are **left alone.** Changing them would break every scene condition and every existing save. Instead the
 * schema moves to a type that tolerates dots (MongoDB 5.0+ allows dots in field names), and only the values are
 * normalised to booleans - what the Map used to do.
 */
export function flagsForStore(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = Boolean(v);
  return out;
}

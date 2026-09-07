// Choosing the patch to inherit when the same ROM is uploaded again (#190).
//
// Once ROMs and patches gained sha256s (#188), "the same ROM" could be judged by bytes. IPS has no checksum of its
// own, so the file alone cannot say which ROM it targets - but **the fact that someone attached it to exactly that
// hash of a ROM** is itself the evidence of compatibility.
//
// This module guarantees one thing - **when it is ambiguous, it does nothing.** The same ROM can have both a Korean
// and an English patch uploaded, and picking either at random changes the game's language against the uploader's
// wishes. The card's checkbox shows only "patch on/off" and never asks which patch, so when they differ it keeps
// its hands off.

/** The shape of a stored hash. Empty or a different shape means "unknown" and drops out of the candidates. */
const SHA256_HEX = /^[0-9a-f]{64}$/;

export interface InheritablePatch {
  name: string;
  format: string;
  size: number;
  /** The source object key to copy from. */
  objectKey: string;
  sha256: string;
}

/**
 * The one patch to inherit, or `null`.
 *
 * - Candidates with an unknown hash or `objectKey` are discarded (pre-backfill documents, broken entries).
 * - One is chosen **only when the remaining candidates' bytes are all identical**.
 * - If even one differs it returns `null` - we have no way of knowing which is right.
 */
export function pickInheritablePatch(
  candidates: readonly Partial<InheritablePatch>[],
): InheritablePatch | null {
  const usable = candidates.filter(
    (c): c is InheritablePatch =>
      typeof c?.sha256 === 'string' &&
      SHA256_HEX.test(c.sha256) &&
      typeof c.objectKey === 'string' &&
      c.objectKey.length > 0,
  );
  if (!usable.length) return null;

  const first = usable[0];
  // Differing bytes mean no choice is made.
  if (usable.some((c) => c.sha256 !== first.sha256)) return null;
  return first;
}

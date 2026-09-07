// The content key that separates netplay rooms (#188).
//
// netplay is **lockstep input synchronisation** - button presses are exchanged with frame numbers attached, on the
// premise that both sides run the same computation in their own emulator and reach the same result. That premise
// holds **only when the two ROMs are byte-for-byte identical**.
//
// EmulatorJS never checks ROM equality (measured). A matching `game_id` alone joins a room even with different ROMs,
// and it **desyncs quietly** from there - the screens diverge with no error.
// So the room number is tied to **the bytes the core actually reads**. Different bytes, different key; different keys never meet.
//
// This module is pure. The hash itself is computed by the server at upload time and stored on the document.

/** The shape of the hash stored on the document - 64 hex characters of sha256. Empty means "not known yet". */
const SHA256_HEX = /^[0-9a-f]{64}$/;

export interface ContentParts {
  /** The ROM file's sha256. */
  romHash?: string;
  /** The applied patch's sha256. Empty when no patch is used. */
  patchHash?: string;
  /**
   * Whether a patch is applied. If `patchHash` is empty while this is true, the state is **unknown** and no key can
   * be made (using a patch with an unknown hash would produce the same key as someone using none).
   */
  hasPatch?: boolean;
  /** The sha256s of the arcade parent ROM sets. These are bytes the core reads too. */
  parentHashes?: string[];
}

/**
 * The canonical string that separates rooms. With insufficient grounds it returns **null** - the caller then hides
 * the netplay entry. Not connecting beats joining the wrong room and desyncing.
 *
 * Parent sets are sorted before inclusion. There is no reason to require the same upload order.
 */
export function contentKeyOf(parts: ContentParts): string | null {
  const rom = (parts.romHash ?? '').trim().toLowerCase();
  if (!SHA256_HEX.test(rom)) return null;

  const patch = (parts.patchHash ?? '').trim().toLowerCase();
  if (patch && !SHA256_HEX.test(patch)) return null;
  // Using a patch with an unknown hash is indistinguishable from "using none" - which is the most dangerous case.
  if (parts.hasPatch && !patch) return null;

  const parents = (parts.parentHashes ?? []).map((h) => (h ?? '').trim().toLowerCase());
  if (parents.some((h) => !SHA256_HEX.test(h))) return null;

  // The separator is fixed - two people must produce the same string to land in the same room.
  return ['rom', rom, 'patch', patch, 'sets', [...parents].sort().join(',')].join('|');
}

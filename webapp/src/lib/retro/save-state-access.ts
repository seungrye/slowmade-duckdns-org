// Checking access to a save-state key (#114).
//
// Four routes make the same check, so it lives in one place. `parseGameKey` covers the format and existence, and this
// adds **what only the DB can answer** - whether that ROM is mine.

import { connectToDB } from '@/lib/db';
import RetroRom from '@/models/retro-rom';
import { parseGameKey } from './game-key';

/**
 * The cap on one save (#114).
 *
 * It must stay inside middleware's body limit (10MB) - exceeding it truncates the body and breaks the parse.
 * In practice a Mega Drive state is the largest at about 1MB.
 *
 * **Why it lives here rather than in the route file**: a Next route module may export only HTTP methods and certain
 * settings, and any other export makes the production build fail with a type error
 * (which `tsc --noEmit` alone does not catch).
 */
export const MAX_STATE_BYTES = 8 * 1024 * 1024;

/**
 * Whether this user may use this game key.
 *
 * - `builtin:` - anyone (logged in) may use it if it is in the manifest
 * - `rom:` - **only when it is a ROM I uploaded**. A save slot cannot be made under someone else's ROM key
 */
export async function canUseGameKey(email: string, key: string | null | undefined): Promise<boolean> {
  const parsed = parseGameKey(key);
  if (!parsed) return false;
  if (parsed.kind === 'builtin') return true;

  await connectToDB();
  const owned = await RetroRom.exists({
    _id: parsed.id,
    userEmail: email,
    isDeleted: { $ne: true },
  });
  return Boolean(owned);
}

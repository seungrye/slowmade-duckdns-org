// The key that says which game a save state hangs on (#114).
//
// It handles bundled homebrew (`builtin:<slug>`) and uploaded ROMs (`rom:<mongoId>`) the same way.
//
// **It does not accept any old string.** The key is the storage slot's name, so accepting it unvalidated would turn
// this into free storage where anyone could upload unlimited 8MB files under arbitrary keys. Both the format and
// **whether it exists** (a slug present in the manifest) are checked here. Ownership needs the DB and is checked in
// the route.

import { builtinBySlug } from './library';
import { isRomId } from './rom-dto';

export type ParsedGameKey =
  | { kind: 'builtin'; slug: string }
  | { kind: 'rom'; id: string };

export function builtinKey(slug: string): string {
  return `builtin:${slug}`;
}

export function romKey(id: string): string {
  return `rom:${id}`;
}

/** Checks the format and existence. A mismatch gives null - the caller answers 404. */
export function parseGameKey(key: string | null | undefined): ParsedGameKey | null {
  if (!key) return null;

  // There must be exactly two parts - 'builtin:a:b' and the like are refused.
  const parts = key.split(':');
  if (parts.length !== 2) return null;
  const [prefix, value] = parts;
  if (!value) return null;

  if (prefix === 'builtin') {
    // Only games actually in the manifest. Path escapes (`../`) are caught here too.
    return builtinBySlug(value) ? { kind: 'builtin', slug: value } : null;
  }
  if (prefix === 'rom') {
    return isRomId(value) ? { kind: 'rom', id: value } : null;
  }
  return null;
}

// The bundled homebrew list (#109).
//
// All of it is **freely distributable homebrew** collected by [retrobrews](https://github.com/retrobrews). Commercial
// ROMs are not included - personal ROMs are uploaded by users and kept private to them (the `RetroRom` model).
//
// The files themselves are not in the repo. `scripts/games/fetch-emulatorjs.sh` reads this list and downloads them
// into `public/games/retro/roms|covers/`. So **an entry whose file is missing never appears on screen**
// (`filterExistingBuiltins`) - hiding it beats showing a card that only links and never runs.

import type { BuiltinGame } from './entry';

import gamesJson from './builtin-games.json';

/**
 * The list is **kept as JSON** - `scripts/games/fetch-emulatorjs.sh` reads the same file to download the ROMs and
 * covers. A TS array could not be read from the shell, so the list would be maintained twice and drift apart.
 * Adding an entry means editing the JSON alone, and both the UI and the download follow.
 *
 * The download address is built from `source` (the retrobrews repo) - no separate field for it.
 */
export const BUILTIN_GAMES: BuiltinGame[] = gamesJson as BuiltinGame[];

export function builtinBySlug(slug: string): BuiltinGame | undefined {
  return BUILTIN_GAMES.find((g) => g.slug === slug);
}

/**
 * Keeps only the entries whose ROM file actually exists.
 *
 * The existence check is **injected** (`exists`) - having this module reach for fs directly would weigh down both the
 * client bundle and the tests. A server component passes in a function that wraps fs.
 */
export function filterExistingBuiltins(
  games: BuiltinGame[],
  exists: (relativePath: string) => boolean,
): BuiltinGame[] {
  return games.filter((g) => exists(`roms/${g.file}`));
}

/** A copy that also reflects whether the cover was actually downloaded - without it the card draws a fallback tile. */
export function withExistingCovers(
  games: BuiltinGame[],
  exists: (relativePath: string) => boolean,
): BuiltinGame[] {
  return games.map((g) => (g.cover && exists(`covers/${g.cover}`) ? g : { ...g, cover: undefined }));
}

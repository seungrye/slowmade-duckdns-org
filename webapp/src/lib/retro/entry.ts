// One entry as laid out in the library (#109).
//
// The list mixes two different things - the **bundled homebrew** that ships with the repo, and the ROMs users
// **uploaded themselves**. They are given the same shape here so the UI, search and filters need not tell them apart.

import { isArcade, platformById, type PlatformId } from './platforms';

export type GameSource = 'builtin' | 'rom';

export interface GameEntry {
  /** The list key - it includes the origin, so merging the two lists cannot collide. */
  key: string;
  source: GameSource;
  id: string;
  title: string;
  platform: PlatformId;
  /** The cover image path. Without it the card draws a fallback tile. */
  cover?: string;
  /** The ROM address the emulator fetches. It must be same-origin (our server). */
  romUrl: string;
  playHref: string;
  /** The small print under the card - the source or the file size. */
  subtitle?: string;
  /** The three below exist only for uploaded ROMs (#116) - the card uses them to draw the patch chip and the save dot. */
  patch?: RomPatchDto;
  patchEnabled?: boolean;
  hasSave?: boolean;
  /** The parent ROM set addresses to place alongside the core (#143) - arcade split sets. Kept separate rather than merged (#148). */
  parentUrls?: string[];
  /** Whether it is a candidate for restoring a game save under the old name (`file.srm`) (#175). See `ROM_URL_CHANGED_AT`. */
  legacySave?: boolean;
}

export interface BuiltinGame {
  slug: string;
  title: string;
  platform: PlatformId;
  /** The filename inside `public/games/retro/roms/`. */
  file: string;
  /** The cover filename (`public/games/retro/covers/`). Without it, a fallback tile. */
  cover?: string;
  /** Where it came from - shown in the UI so the licence can be checked. */
  source: string;
  license: string;
  description?: string;
}

export interface RomPatchDto {
  id: string;
  name: string;
  format: string;
  size: number;
}

export interface UserRomDto {
  id: string;
  title: string;
  platform: PlatformId;
  size: number;
  createdAt: string;
  /** The original filename at upload - arcade identifies the game by this name (#139). */
  filename?: string;
  /** The live patch - at most one per ROM (#116). */
  patch?: RomPatchDto;
  /** Whether to apply the patch. The card's checkbox toggles it. */
  patchEnabled?: boolean;
  /** Whether a server save exists - the marker in the card's corner. */
  hasSave?: boolean;
  /** The user-uploaded cover's address (#122). Without it the card draws a fallback tile. */
  coverUrl?: string;
  /** The parent ROM set names to place alongside the core (#143) - the name is the archive name, so it is used as is. */
  parentSets?: string[];
}

/**
 * When #137 (changing the ROM address to end in `<id>.<ext>`) was deployed - the moment PR #138 merged.
 *
 * That change moved the name the core looks for its battery save under from `file.srm` to `<id>.srm`.
 * So **only ROMs uploaded before this moment** can have a save under the old name - anything after ran on the new
 * address from the start. `file.srm` was **a name shared between games**, so this boundary is the lock that stops one
 * game pulling in another's save.
 */
export const ROM_URL_CHANGED_AT = '2026-08-13T03:21:16.000Z';

/** Whether this ROM might have a save under the old name (`file.srm`) (#175). Unknown gives false - when unsure, leave it alone. */
function hasLegacySave(createdAt: string | undefined): boolean {
  const t = Date.parse(createdAt ?? '');
  return Number.isFinite(t) && t < Date.parse(ROM_URL_CHANGED_AT);
}

export const BUILTIN_ROM_DIR = '/games/retro/roms';
export const BUILTIN_COVER_DIR = '/games/retro/covers';

export function builtinEntry(game: BuiltinGame): GameEntry {
  return {
    key: `builtin:${game.slug}`,
    source: 'builtin',
    id: game.slug,
    title: game.title,
    platform: game.platform,
    cover: game.cover ? `${BUILTIN_COVER_DIR}/${game.cover}` : undefined,
    romUrl: `${BUILTIN_ROM_DIR}/${game.file}`,
    playHref: `/games/retro/play/builtin/${game.slug}`,
    subtitle: game.license,
  };
}

export function romEntry(rom: UserRomDto): GameEntry {
  return {
    key: `rom:${rom.id}`,
    source: 'rom',
    id: rom.id,
    title: rom.title,
    platform: rom.platform,
    // The card draws the image when there is a cover and a tile otherwise - no new branch is needed.
    cover: rom.coverUrl,
    // The public /s3/ path is not used - anyone who knows the address could download it.
    // It is served only through an authenticated proxy that admits the uploader alone.
    romUrl: romFileUrl(rom),
    playHref: `/games/retro/play/rom/${rom.id}`,
    subtitle: formatBytes(rom.size),
    patch: rom.patch,
    patchEnabled: rom.patchEnabled,
    hasSave: rom.hasSave,
    parentUrls: (rom.parentSets ?? []).map(
      (n) => `/api/games/retro/roms/${rom.id}/set/${encodeURIComponent(n)}`,
    ),
    legacySave: hasLegacySave(rom.createdAt),
  };
}

/**
 * The ROM file address (#137).
 *
 * It ends in `<id>.<ext>`. **EmulatorJS uses the last segment of the URL as its browser cache (IndexedDB) key** - when
 * everything ended in `.../file` as before, the keys collided into one, so two ROMs of the same byte size could load
 * the wrong game. Including the id keeps the keys distinct per ROM.
 * The extension also carries through to the virtual filename the core uses.
 */
export function romFileUrl(rom: { id: string; platform: PlatformId; filename?: string }): string {
  // On arcade **the filename is the game's name** (ssf2t.zip). Change it and the core cannot find the ROM.
  // The cache key then splits by filename instead, which only collides when the same name and size is uploaded twice,
  // so there is no real risk.
  if (isArcade(rom.platform) && rom.filename) {
    return `/api/games/retro/roms/${rom.id}/file/${encodeURIComponent(rom.filename)}`;
  }
  const ext = platformById(rom.platform)?.extensions[0] ?? '.bin';
  return `/api/games/retro/roms/${rom.id}/file/${rom.id}${ext}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  // One decimal place, as in 1.5 MB - rounding to an integer would show 0 MB.
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

// The systems the retro games corner supports (#109).
//
// This one place is the single source for systems - the label, the EmulatorJS core, the extensions and the fallback
// tile colour all come from this array. Adding a system means one more line here plus the same core in
// `scripts/games/fetch-emulatorjs.sh`'s KEEP_CORES (without downloading the core file it 404s at run time).
//
// N64 and PS1 are left out - they are heavy, and PS1 has BIOS copyright issues.

export type PlatformId = 'snes' | 'gba' | 'arcade';

export interface PlatformMeta {
  id: PlatformId;
  /** The short name used in lists and badges. */
  label: string;
  /** The full name - for tooltips and the detail screen. */
  fullName: string;
  /**
   * The EmulatorJS `EJS_core` value. It uses **the concrete core name**, not a system alias ('nes') -
   * an alias can map to a different core across EmulatorJS versions, which hurts reproducibility.
   */
  core: string;
  /** Lowercase, with the dot. platformForFilename compares on that shape. */
  extensions: string[];
  /** The fallback tile gradient (a tailwind class) for a card with no cover. */
  accent: string;
  /**
   * Whether it is arcade-family (#139).
   *
   * When the core is arcade or mame family, EmulatorJS writes the ROM into the virtual FS **under its filename**.
   * An arcade core identifies the game by that name, so changing it means it cannot be found.
   */
  arcade?: boolean;
}

export const PLATFORMS: PlatformMeta[] = [
  {
    id: 'snes',
    label: 'SNES',
    fullName: '슈퍼 패미컴 / SNES',
    core: 'snes9x',
    extensions: ['.sfc', '.smc'],
    accent: 'from-violet-500 to-indigo-700',
  },
  {
    id: 'gba',
    label: 'GBA',
    fullName: '게임보이 어드밴스',
    // mGBA runs without a BIOS (HLE) - no separate file has to be downloaded.
    core: 'mgba',
    extensions: ['.gba'],
    accent: 'from-sky-500 to-blue-700',
  },
  {
    // Arcade goes through FBNeo alone - it **replaced** the CPS2-only fbalpha2012 (#151).
    //   fbalpha2012 : embeds the CPS2 decryption keys but **rejects modified ROMs by CRC**, making a runtime
    //                 translation patch fundamentally impossible (#150). One byte off and loading fails.
    //   fbneo       : requires a `<set>.key` (20 bytes) in the ROM set. In exchange it accepts a ROM from the
    //                 patched path by name even with a different CRC, so **runtime patching works**.
    //                 It also runs much wider hardware, CPS1 and Neo Geo among them.
    // Recent MAME/FBNeo ROM sets include the .key. Without it, loading logs what is needed.
    id: 'arcade',
    label: 'FBNeo',
    fullName: '아케이드 (FBNeo) — 롬셋에 .key 필요',
    core: 'fbneo',
    extensions: ['.zip'],
    accent: 'from-emerald-500 to-teal-700',
    arcade: true,
  },
];

/** Whether it is arcade-family (#139) - derived from the array's `arcade` flag. */
export function isArcade(platform: PlatformId | string | undefined): boolean {
  return platformById(platform)?.arcade === true;
}

/** The whitelist of cores that may be passed to the player - it blocks arbitrary strings. */
export const SUPPORTED_CORES: Set<string> = new Set(PLATFORMS.map((p) => p.core));

export function platformById(id: PlatformId | string | undefined): PlatformMeta | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

/**
 * Infers the system from the filename's extension. Unknown gives undefined - the caller then has the user choose.
 *
 * `.bin` and `.zip` are deliberately assigned to no system. They are shared across systems, and a wrong inference
 * leads to "why does this not run". Saying it is unknown and letting the user pick is better.
 */
export function platformForFilename(filename: string): PlatformMeta | undefined {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return undefined;
  const ext = filename.slice(dot).toLowerCase();
  return PLATFORMS.find((p) => p.extensions.includes(ext));
}

/** Every extension for the upload <input accept=...>. */
export const ALL_ROM_EXTENSIONS: string[] = PLATFORMS.flatMap((p) => p.extensions);

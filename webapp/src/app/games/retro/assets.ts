// Checking whether the emulator assets are actually deployed on the server (#109).
//
// `public/games/retro/{data,roms,covers}/` is gitignored and is filled by running
// `scripts/games/fetch-emulatorjs.sh` on the deploy host. Showing cards while it is unfilled gives a black screen
// on tapping, so what is missing is hidden with an explanation of why.
//
// Server only - never import it from a client component (it reaches for fs).

import { existsSync } from "node:fs";
import { join } from "node:path";

/** The absolute path of `public/games/retro`. */
const RETRO_PUBLIC_DIR = join(process.cwd(), "public", "games", "retro");

/** Checks existence by a path relative to the retro directory, such as `roms/foo.nes`. */
export function retroAssetExists(relativePath: string): boolean {
  return existsSync(join(RETRO_PUBLIC_DIR, relativePath));
}

/** Whether EmulatorJS itself is deployed - one loader is enough to tell. */
export function emulatorAssetsInstalled(): boolean {
  return retroAssetExists("data/loader.js");
}

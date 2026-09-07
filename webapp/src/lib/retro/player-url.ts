// Building the iframe address that launches EmulatorJS (#109).
//
// Why an iframe: EmulatorJS is an old-style loader that reads `EJS_*` **globals** and injects its own scripts, CSS and
// DOM. Mounting it directly under Next.js client routing leaves the globals and DOM behind when moving between routes,
// so the second run breaks. Loading the static player.html in an iframe traps the global pollution inside it, and
// leaving the screen destroys the iframe and cleans everything up at once.

import { SUPPORTED_CORES } from './platforms';
import { gameNumberOf } from './game-number';

export const PLAYER_PATH = '/games/retro/player.html';

export interface PlayerUrlOptions {
  /** The EmulatorJS core name. Only those registered in PLATFORMS are allowed. */
  core: string;
  /** The ROM address - a same-origin absolute path or a blob: URL. */
  rom: string;
  /** The name to show on the player screen. */
  name?: string;
  /** The address of the patch to apply (#112). It is under the same same-origin restriction as the ROM. */
  patch?: string;
  /**
   * Whether to strip the SFC 512-byte header before patching (#112).
   *
   * Left unset, the player decides - BPS and UPS find the right side automatically by CRC, while IPS has no checksum
   * and follows convention (strip when a header is visible). It is only sent when the user overrides it.
   */
  stripHeader?: boolean;
  /**
   * The game key the save hangs on (#114) - `builtin:<slug>` or `rom:<id>`.
   * Given it, the player routes the native Save/Load buttons to the server. Without it, saving is not wired up at all.
   */
  saveKey?: string;
  /** The parent ROM set addresses to place alongside the core (#143) - the common ones first. */
  parents?: string[];
  /**
   * Whether to restore a game save left under the old name (#175).
   *
   * The server decides (`ROM_URL_CHANGED_AT` in `entry.ts`) - the old name `file.srm` was a slot shared between
   * games, so letting any game take it would pull in someone else's save.
   */
  legacySave?: boolean;
  /**
   * Whether to open in netplay (#186). Turning it on makes the player set `EJS_gameID` and `EJS_netplayServer`.
   *
   * `gameID` separates the rooms - both PCs must open with **the same game key** to land in the same room.
   */
  netplay?: boolean;
  /** The game key that separates netplay rooms (`rom:<id>` and so on). Used only when netplay is on. */
  gameKeyForNetplay?: string;
}

/**
 * @throws when the core is outside the whitelist, or the ROM or patch address is cross-origin.
 *   The iframe runs code on our origin, so letting an arbitrary URL through here would make it a channel for playing
 *   someone else's server files in our player.
 */
export function buildPlayerUrl({ core, rom, name, patch, stripHeader, saveKey, parents, legacySave, netplay, gameKeyForNetplay }: PlayerUrlOptions): string {
  if (!SUPPORTED_CORES.has(core)) throw new Error(`지원하지 않는 코어: ${core || '(빈 값)'}`);
  if (!rom) throw new Error('롬 주소가 비었습니다.');
  if (!isSameOriginRom(rom)) throw new Error(`외부 출처 롬은 실행하지 않습니다: ${rom}`);
  if (patch && !isSameOriginRom(patch)) {
    throw new Error(`외부 출처 패치는 적용하지 않습니다: ${patch}`);
  }

  const params = new URLSearchParams({ core, rom });
  if (name) params.set('name', name);
  if (patch) {
    params.set('patch', patch);
    if (typeof stripHeader === 'boolean') params.set('strip', stripHeader ? '1' : '0');
  }
  if (saveKey) params.set('save', saveKey);
  if (legacySave) params.set('legacy', '1');
  if (netplay) {
    params.set('np', '1');
    // The game number is computed on the server and sent along - both PCs must see the same number to share a room.
    params.set('gid', String(gameNumberOf(gameKeyForNetplay || saveKey || rom)));
  }
  // The given order is preserved - URLSearchParams keeps insertion order.
  for (const p of parents ?? []) {
    if (!isSameOriginRom(p)) throw new Error(`외부 출처 롬셋은 쓰지 않습니다: ${p}`);
    params.append('set', p);
  }
  return `${PLAYER_PATH}?${params.toString()}`;
}

/**
 * Whether it is same-origin. Only absolute paths starting with `/` are allowed, and `//host` (a protocol-relative
 * URL) is blocked - that is an external host. `blob:` for opening a local ROM directly is allowed, being browser-made.
 */
function isSameOriginRom(rom: string): boolean {
  if (rom.startsWith('blob:')) return true;
  return rom.startsWith('/') && !rom.startsWith('//');
}

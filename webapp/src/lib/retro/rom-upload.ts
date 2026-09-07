// Validating an uploaded ROM file (#109) - pure functions. Kept in this one place so the client (warning in advance)
// and the API route (the real gate) use **the same rules**.

import { platformById, platformForFilename, type PlatformId } from './platforms';

/**
 * The size cap for one ROM (#146 - 50MB).
 *
 * **It must be matched in nginx.** The server default is 16M, so using this value requires
 * `location = /api/games/retro/rom-upload { client_max_body_size 50M; }`.
 * In **both domain snapshots** (`scripts/deploy/{slowmade.duckdns.org,handmade.r-e.kr}.nginx`) - fixing only one
 * makes uploads on that domain 413 at nginx, with nothing in the app log and no visible reason.
 *
 * Owners and ordinary users are not distinguished - nginx blocks everyone at the same value anyway.
 */
export const MAX_ROM_BYTES = 50 * 1024 * 1024;

export interface RomUploadInput {
  filename: string;
  size: number;
  /** The system the user picked explicitly. It wins over inference from the extension. */
  platform?: PlatformId | string;
}

export type RomValidation =
  | { ok: true; platform: PlatformId; core: string; title: string }
  | { ok: false; reason: string };

/**
 * A display title with the extension removed and path segments stripped.
 *
 * Underscores become spaces - ROM filenames have a settled convention of using underscores for spaces
 * (`zelda_a_link_to_the_past.sfc`), and leaving them makes the list unreadable.
 */
export function romTitleFromFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  // dot === 0 means a name that is only an extension, such as '.nes' - there is no stem.
  const stem = (dot > 0 ? base.slice(0, dot) : dot === 0 ? '' : base).replace(/_+/g, ' ').trim();
  if (!stem) return '이름 없는 롬';
  return stem.slice(0, 120);
}

export function validateRomUpload(input: RomUploadInput): RomValidation {
  if (input.size <= 0) return { ok: false, reason: '파일이 비어 있습니다.' };
  if (input.size > MAX_ROM_BYTES) {
    const mb = Math.floor(MAX_ROM_BYTES / (1024 * 1024));
    return { ok: false, reason: `파일이 너무 큽니다 (최대 ${mb}MB).` };
  }

  // A system the user picked is trusted - needed for files like .bin where inference is impossible.
  const chosen = input.platform ? platformById(input.platform) : undefined;
  if (input.platform && !chosen) {
    return { ok: false, reason: `지원하지 않는 기종입니다: ${input.platform}` };
  }

  const meta = chosen ?? platformForFilename(input.filename);
  if (!meta) {
    return { ok: false, reason: '어느 기종의 롬인지 알 수 없습니다. 기종을 직접 골라 주세요.' };
  }

  return { ok: true, platform: meta.id, core: meta.core, title: romTitleFromFilename(input.filename) };
}

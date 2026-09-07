// Validating an uploaded patch file (#112) - pure functions.
//
// Format detection **reuses what is in `public/games/retro/rom-patch.js`.** Different criteria for accepting and for
// applying would let a file be accepted and then turn out to be "an unsupported format" at run time.

import { detectPatchFormat } from '../../../public/games/retro/rom-patch.js';

/** The 7z magic - not accepted, but distinguished so the user is told **why**. */
function is7z(bytes: Uint8Array): boolean {
  return bytes.length >= 6 && bytes[0] === 0x37 && bytes[1] === 0x7a &&
    bytes[2] === 0xbc && bytes[3] === 0xaf && bytes[4] === 0x27 && bytes[5] === 0x1c;
}

/**
 * The size cap for one patch.
 *
 * It must stay inside middleware's body buffer limit (10MB) - exceeding it makes Next truncate the body and break the
 * parse, so the user never sees the reason. That is why, unlike ROMs, it is not excluded from the matcher
 * (a translation patch is usually a few hundred KB to a few MB, so 8MB is plenty).
 */
export const MAX_PATCH_BYTES = 8 * 1024 * 1024;

export type PatchFormat = 'ips' | 'bps' | 'ups' | 'zip';

export interface PatchUploadInput {
  filename: string;
  size: number;
  /** For format detection - the first 8 bytes are enough. */
  bytes: Uint8Array;
}

export type PatchValidation =
  | { ok: true; format: PatchFormat; name: string }
  | { ok: false; reason: string };

/** A display name with path segments stripped. **The extension stays** - the list has to show which format it is. */
export function patchNameFromFilename(filename: string): string {
  const base = (filename.split(/[/\\]/).pop() ?? '').trim();
  if (!base) return '이름 없는 패치';
  return base.slice(0, 120);
}

export function validatePatchUpload(input: PatchUploadInput): PatchValidation {
  if (input.size <= 0) return { ok: false, reason: '파일이 비어 있습니다.' };
  if (input.size > MAX_PATCH_BYTES) {
    return {
      ok: false,
      reason: `패치가 너무 큽니다 (최대 ${Math.floor(MAX_PATCH_BYTES / (1024 * 1024))}MB).`,
    };
  }

  // Judged by content (the magic), not the extension - names can be changed at will.
  const format = detectPatchFormat(input.bytes) as PatchFormat | null;
  if (!format) {
    // There is no way to unpack 7z in the browser - repacking it as a zip makes it usable as is.
    if (is7z(input.bytes)) {
      return { ok: false, reason: '7z 은 지원하지 않습니다. zip 으로 다시 묶어 올려 주세요.' };
    }
    return { ok: false, reason: 'IPS·BPS·UPS 또는 패치 묶음(zip) 이 아닙니다.' };
  }

  return { ok: true, format, name: patchNameFromFilename(input.filename) };
}

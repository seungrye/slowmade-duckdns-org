// Validating what can be edited from the card (#122) - pure functions.
//
// Kept in one place so the client (telling the user before sending) and the API route (the real gate) use **the same rules**.
// The same structure as `patch-upload.ts`.

/** The title length cap - as much as fits one line of the card. */
export const MAX_TITLE_LENGTH = 120;

/**
 * The cover image cap.
 * It must stay inside middleware's body limit (10MB) - exceeding it truncates the body and breaks the parse.
 */
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

/**
 * Tidies it into a title for the UI. null when unusable.
 *
 * Inner whitespace is untouched - it is part of the title. Only newlines become spaces (it is a one-line name).
 */
export function normalizeRomTitle(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const oneLine = raw.replace(/[\r\n]+/g, ' ').trim();
  if (!oneLine) return null;
  return oneLine.slice(0, MAX_TITLE_LENGTH);
}

const startsWith = (bytes: Uint8Array, sig: number[], at = 0) =>
  sig.every((b, i) => bytes[at + i] === b);

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/**
 * Identifies the image format by magic bytes. The extension is ignored - names can be changed at will.
 *
 * An unknown format gives null. Setting a file the browser cannot draw as a cover leaves a broken image on the card.
 */
export function detectImageFormat(bytes: Uint8Array): string | null {
  if (!bytes || bytes.length < 4) return null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) return 'image/gif';
  // RIFF is also used by wav - the 'WEBP' eight bytes in is what makes it an image.
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}

export type CoverValidation = { ok: true; format: string } | { ok: false; reason: string };

export function validateCoverUpload(input: { size: number; bytes: Uint8Array }): CoverValidation {
  if (input.size <= 0) return { ok: false, reason: '파일이 비어 있습니다.' };
  if (input.size > MAX_COVER_BYTES) {
    return {
      ok: false,
      reason: `이미지가 너무 큽니다 (최대 ${Math.floor(MAX_COVER_BYTES / (1024 * 1024))}MB).`,
    };
  }
  const format = detectImageFormat(input.bytes);
  if (!format) return { ok: false, reason: '이미지 파일이 아닙니다 (PNG·JPEG·WebP·GIF).' };
  return { ok: true, format };
}

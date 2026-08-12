// 카드에서 고치는 것들의 검증 (#122) — 순수 함수.
//
// 클라이언트(보내기 전에 알려주기)와 API 라우트(진짜 관문)가 **같은 규칙**을 쓰도록 한 곳에 둔다.
// `patch-upload.ts` 와 같은 구조다.

/** 제목 길이 상한 — 카드 한 줄에 들어갈 만큼. */
export const MAX_TITLE_LENGTH = 120;

/**
 * 커버 이미지 상한.
 * middleware 본문 제한(10MB) 안이어야 한다 — 넘기면 본문이 잘려 파싱이 깨진다.
 */
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

/**
 * 화면에 쓸 제목으로 다듬는다. 쓸 수 없으면 null.
 *
 * 가운데 공백은 건드리지 않는다 — 제목의 일부다. 개행만 공백으로 바꾼다(한 줄짜리 이름이다).
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
 * 매직 바이트로 이미지 형식을 가린다. 확장자는 보지 않는다 — 이름은 얼마든지 바꿀 수 있다.
 *
 * 모르는 형식은 null. 브라우저가 못 그릴 파일을 커버로 앉히면 카드가 깨진 그림이 된다.
 */
export function detectImageFormat(bytes: Uint8Array): string | null {
  if (!bytes || bytes.length < 4) return null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) return 'image/gif';
  // RIFF 는 wav 도 쓴다 — 8 바이트 뒤의 'WEBP' 까지 봐야 그림이라고 할 수 있다.
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

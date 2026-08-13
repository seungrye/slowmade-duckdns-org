// 업로드된 패치 파일 검사 (#112) — 순수 함수.
//
// 형식 판별은 **`public/games/retro/rom-patch.js` 의 것을 그대로 쓴다.** 실제로 적용할 때와
// 받아들일 때의 기준이 다르면, 받아 놓고 실행 시점에 "지원하지 않는 형식" 이 되는 일이 생긴다.

import { detectPatchFormat } from '../../../public/games/retro/rom-patch.js';

/** 7z 매직 — 받지는 않지만 **왜 안 되는지** 알려 주려고 구분한다. */
function is7z(bytes: Uint8Array): boolean {
  return bytes.length >= 6 && bytes[0] === 0x37 && bytes[1] === 0x7a &&
    bytes[2] === 0xbc && bytes[3] === 0xaf && bytes[4] === 0x27 && bytes[5] === 0x1c;
}

/**
 * 패치 한 개의 크기 한도.
 *
 * middleware 의 본문 버퍼 제한(10MB) 안에 있어야 한다 — 넘기면 Next 가 본문을 자르며 파싱이
 * 깨져 사용자에게 이유가 안 보인다. 롬과 달리 matcher 에서 빼지 않는 이유가 이것이다
 * (번역 패치는 보통 수백 KB~수 MB 라 8MB 면 충분하다).
 */
export const MAX_PATCH_BYTES = 8 * 1024 * 1024;

export type PatchFormat = 'ips' | 'bps' | 'ups' | 'zip';

export interface PatchUploadInput {
  filename: string;
  size: number;
  /** 형식 판별용 — 앞 8 바이트만 있어도 된다. */
  bytes: Uint8Array;
}

export type PatchValidation =
  | { ok: true; format: PatchFormat; name: string }
  | { ok: false; reason: string };

/** 경로 조각을 지운 표시용 이름. **확장자는 남긴다** — 어떤 형식인지 목록에서 보여야 한다. */
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

  // 확장자가 아니라 내용(매직)으로 본다 — 이름은 얼마든지 바꿀 수 있다.
  const format = detectPatchFormat(input.bytes) as PatchFormat | null;
  if (!format) {
    // 7z 은 브라우저에서 풀 수단이 없다 — zip 으로 다시 묶으면 그대로 쓸 수 있다.
    if (is7z(input.bytes)) {
      return { ok: false, reason: '7z 은 지원하지 않습니다. zip 으로 다시 묶어 올려 주세요.' };
    }
    return { ok: false, reason: 'IPS·BPS·UPS 또는 패치 묶음(zip) 이 아닙니다.' };
  }

  return { ok: true, format, name: patchNameFromFilename(input.filename) };
}

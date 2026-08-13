// 업로드된 롬 파일 검사 (#109) — 순수 함수. 클라이언트(미리 알려주기)와 API 라우트(진짜 관문)가
// **같은 규칙**을 쓰도록 여기 한 곳에 둔다.

import { platformById, platformForFilename, type PlatformId } from './platforms';

/**
 * 롬 한 개의 크기 상한 (#146 — 50MB).
 *
 * **nginx 와 짝을 맞춰야 한다.** 서버 기본값은 16M 이라, 이 값을 쓰려면
 * `location = /api/games/retro/rom-upload { client_max_body_size 50M; }` 가 있어야 한다.
 * **두 도메인 스냅샷 모두**(`scripts/deploy/{slowmade.duckdns.org,handmade.r-e.kr}.nginx`) —
 * 한쪽만 고치면 그 도메인으로 들어온 업로드가 nginx 단에서 413 이 나고, 앱 로그에는
 * 아무것도 안 남아 이유가 안 보인다.
 *
 * owner 와 일반 사용자를 나누지 않는다 — nginx 가 어차피 모두를 같은 값으로 막는다.
 */
export const MAX_ROM_BYTES = 50 * 1024 * 1024;

export interface RomUploadInput {
  filename: string;
  size: number;
  /** 사용자가 직접 고른 기종. 확장자 추론보다 우선한다. */
  platform?: PlatformId | string;
}

export type RomValidation =
  | { ok: true; platform: PlatformId; core: string; title: string }
  | { ok: false; reason: string };

/**
 * 파일명에서 확장자를 떼고 경로 조각을 지운 표시용 제목.
 *
 * 밑줄은 공백으로 바꾼다 — 롬 파일명은 `zelda_a_link_to_the_past.sfc` 처럼 밑줄로 띄어쓰기를
 * 대신하는 관행이 굳어 있어서, 그대로 두면 목록이 읽히지 않는다.
 */
export function romTitleFromFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  // dot === 0 은 '.nes' 같은 확장자뿐인 이름 — 줄기가 없다.
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

  // 사용자가 고른 기종이 있으면 그걸 믿는다 — .bin 처럼 추론이 불가능한 파일 때문에 필요하다.
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

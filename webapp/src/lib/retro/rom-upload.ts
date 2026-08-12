// 업로드된 롬 파일 검사 (#109) — 순수 함수. 클라이언트(미리 알려주기)와 API 라우트(진짜 관문)가
// **같은 규칙**을 쓰도록 여기 한 곳에 둔다.

import { platformById, platformForFilename, type PlatformId } from './platforms';

/**
 * 일반 로그인 사용자 한도.
 *
 * **nginx 의 `client_max_body_size` 서버 기본값 16M 안에 있어야 한다.** 넘기면 nginx 가 앱에
 * 닿기 전에 413 을 내버려서 사용자에게는 이유가 안 보인다(`api/attachment/upload` 가 같은 이유로
 * 15MB 를 쓴다). 테스트가 이 관계를 지킨다.
 */
export const MAX_ROM_BYTES = 15 * 1024 * 1024;

/**
 * owner 한도 — GBA 대작(32MB)까지 받는다.
 *
 * **이 한도를 실제로 쓰려면 nginx 에 `location = /api/games/retro/roms { client_max_body_size 64M; }`
 * 가 있어야 한다.** 없으면 16MB 를 넘는 순간 nginx 413 이다. 설정은
 * `scripts/deploy/slowmade.duckdns.org.nginx` 참고.
 */
export const OWNER_MAX_ROM_BYTES = 64 * 1024 * 1024;

export interface RomUploadInput {
  filename: string;
  size: number;
  /** 사용자가 직접 고른 기종. 확장자 추론보다 우선한다. */
  platform?: PlatformId | string;
  isOwner?: boolean;
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
  const limit = input.isOwner ? OWNER_MAX_ROM_BYTES : MAX_ROM_BYTES;

  if (input.size <= 0) return { ok: false, reason: '파일이 비어 있습니다.' };
  if (input.size > limit) {
    return { ok: false, reason: `파일이 너무 큽니다 (최대 ${Math.floor(limit / (1024 * 1024))}MB).` };
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

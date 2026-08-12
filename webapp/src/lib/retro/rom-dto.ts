// RetroRom 문서를 클라이언트로 내보낼 모양으로 (#109).
//
// 라우트 셋(목록·업로드·페이지)이 같은 변환을 쓰므로 한 곳에 둔다. 핵심은
// **`objectKey` 를 절대 싣지 않는 것** — MinIO 키가 새 나가면 인증 프록시를 우회할 실마리가 된다.

import type { UserRomDto } from './entry';
import type { PlatformId } from './platforms';

export interface LeanRom {
  _id: unknown;
  title: string;
  platform: string;
  size: number;
  createdAt?: Date;
}

export function toRomDto(doc: LeanRom): UserRomDto {
  return {
    id: String(doc._id),
    title: doc.title,
    platform: doc.platform as PlatformId,
    size: doc.size,
    createdAt: (doc.createdAt ?? new Date(0)).toISOString(),
  };
}

/**
 * mongo ObjectId 모양인가.
 *
 * 아무 문자열이나 `findOne({_id})` 에 넣으면 mongoose 가 CastError 를 던져 500 이 난다.
 * 잘못된 id 는 500 이 아니라 404 여야 한다 — 형식 검사로 먼저 걸러 낸다.
 */
export function isRomId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

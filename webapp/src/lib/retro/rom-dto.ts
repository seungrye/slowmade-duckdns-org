// RetroRom 문서를 클라이언트로 내보낼 모양으로 (#109).
//
// 라우트 셋(목록·업로드·페이지)이 같은 변환을 쓰므로 한 곳에 둔다. 핵심은
// **`objectKey` 를 절대 싣지 않는 것** — MinIO 키가 새 나가면 인증 프록시를 우회할 실마리가 된다.

import type { RomPatchDto, UserRomDto } from './entry';
import type { PlatformId } from './platforms';

export interface LeanRom {
  _id: unknown;
  title: string;
  platform: string;
  size: number;
  createdAt?: Date;
  filename?: string;
  patches?: LeanPatch[];
  patchEnabled?: boolean;
  coverKey?: string;
  parentSets?: { name: string; size: number; objectKey: string }[];
}

export interface LeanPatch {
  _id: unknown;
  name: string;
  format: string;
  size: number;
  objectKey?: string;
  isDeleted?: boolean;
  createdAt?: Date;
}

/** 화면에 내보내는 패치 한 개 (#112). objectKey 는 여기에도 없다. */
export interface UserPatchDto {
  id: string;
  name: string;
  format: string;
  size: number;
  createdAt: string;
}

export function toPatchDto(doc: LeanPatch): UserPatchDto {
  return {
    id: String(doc._id),
    name: doc.name,
    format: doc.format,
    size: doc.size,
    createdAt: (doc.createdAt ?? new Date(0)).toISOString(),
  };
}

/** 지우지 않은 패치만, 올린 순서대로. */
export function livePatches(doc: { patches?: LeanPatch[] }): UserPatchDto[] {
  return (doc.patches ?? []).filter((p) => !p.isDeleted).map(toPatchDto);
}

/**
 * 지금 쓰는 패치 하나 (#116).
 *
 * 배열에 살아 있는 게 여럿이어도 **마지막 것**을 쓴다 — 업로드가 교체 방식이라 정상적으로는
 * 하나뿐이지만, 옛 데이터나 경쟁 상태로 여럿 남았을 때 "가장 최근에 올린 것" 이 맞다.
 */
export function activePatch(doc: { patches?: LeanPatch[] }): RomPatchDto | undefined {
  const live = (doc.patches ?? []).filter((p) => !p.isDeleted);
  const last = live[live.length - 1];
  if (!last) return undefined;
  return { id: String(last._id), name: last.name, format: last.format, size: last.size };
}

export function toRomDto(doc: LeanRom, extra?: { hasSave?: boolean }): UserRomDto {
  return {
    id: String(doc._id),
    title: doc.title,
    platform: doc.platform as PlatformId,
    size: doc.size,
    createdAt: (doc.createdAt ?? new Date(0)).toISOString(),
    // 아케이드가 게임을 식별하는 데 쓴다 (#139).
    filename: doc.filename,
    patch: activePatch(doc),
    // 값이 없던 옛 문서는 켜진 것으로 본다 — 패치를 올려 뒀다면 쓰려던 것이다.
    patchEnabled: doc.patchEnabled !== false,
    hasSave: extra?.hasSave ?? false,
    // 인증 프록시로만 내려준다 — 오브젝트 키는 싣지 않는다.
    coverUrl: doc.coverKey ? `/api/games/retro/roms/${String(doc._id)}/cover` : undefined,
    // 오브젝트 키가 아니라 **이름만** 내보낸다 — 주소는 이름으로 만든다.
    parentSets: (doc.parentSets ?? []).map((p) => p.name),
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

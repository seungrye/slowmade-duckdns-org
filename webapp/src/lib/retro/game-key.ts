// 세이브스테이트를 어느 게임에 매달지 가리키는 키 (#114).
//
// 기본 제공 홈브류(`builtin:<slug>`)와 올린 롬(`rom:<mongoId>`)을 한 방식으로 다룬다.
//
// **아무 문자열이나 받지 않는다.** 키가 곧 저장 슬롯의 이름이라, 검증 없이 받으면 누구나
// 임의의 키로 8MB 짜리 파일을 얼마든지 올리는 무료 저장소가 된다. 형식뿐 아니라
// **실재 여부**(매니페스트에 있는 slug 인지)까지 여기서 본다. 소유권은 DB 가 필요하므로
// 라우트에서 확인한다.

import { builtinBySlug } from './library';
import { isRomId } from './rom-dto';

export type ParsedGameKey =
  | { kind: 'builtin'; slug: string }
  | { kind: 'rom'; id: string };

export function builtinKey(slug: string): string {
  return `builtin:${slug}`;
}

export function romKey(id: string): string {
  return `rom:${id}`;
}

/** 형식과 실재 여부를 본다. 어긋나면 null — 호출측은 404 로 답한다. */
export function parseGameKey(key: string | null | undefined): ParsedGameKey | null {
  if (!key) return null;

  // 조각이 정확히 둘이어야 한다 — 'builtin:a:b' 같은 건 받지 않는다.
  const parts = key.split(':');
  if (parts.length !== 2) return null;
  const [prefix, value] = parts;
  if (!value) return null;

  if (prefix === 'builtin') {
    // 매니페스트에 실제로 있는 게임만. 경로 탈출(`../`)도 여기서 함께 걸린다.
    return builtinBySlug(value) ? { kind: 'builtin', slug: value } : null;
  }
  if (prefix === 'rom') {
    return isRomId(value) ? { kind: 'rom', id: value } : null;
  }
  return null;
}

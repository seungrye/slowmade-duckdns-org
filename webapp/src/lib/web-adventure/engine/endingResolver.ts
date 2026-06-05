// 엔딩 헬퍼 — GameState 에서 EndingId 추출 + 메타 lookup 단축.
// 4 주차: EndingScreen 이 이 모듈을 통해 엔딩 종류별로 색감/에필로그를 분기한다.

import type { GameState } from "@/types/web-adventure";
import {
  endingsMeta,
  getEndingMeta as getEndingMetaBase,
  type EndingId,
  type EndingMeta,
} from "@/content/web-adventure/endings";

/**
 * 게임 종료 시 endingId 를 반환. ended phase 가 아니면 null.
 *
 * 호출자는 narrow type 으로 EndingId 를 안전하게 받을 수 있다 (단 — endingId 는
 * 런타임에 정의 외 값이 와도 string 그대로 통과한다 — UI 에서 fallback 처리).
 */
export function resolveEnding(state: GameState): EndingId | string | null {
  if (state.phase !== "ended") return null;
  return state.endingId;
}

/** 6 엔딩의 메타 lookup. 미정의 id 는 fallback 메타 반환. */
export function getEndingMeta(id: string): EndingMeta {
  return getEndingMetaBase(id);
}

/** UI 에서 endingId 가 알려진 6 엔딩 중 하나인지 검사. */
export function isKnownEnding(id: string): id is EndingId {
  return id in endingsMeta;
}

// 한 표를 내보낸다 (#475) — 부수효과 경계.
//
// 두 곳에 남긴다:
//   1. **localStorage** — 본인 기기에서 바로 들여다볼 수 있게. 서버가 없어도 남는다.
//   2. **Firebase(`adv_refine_ui_vote`)** — 여러 사람의 표를 모으는 곳.
//
// ── 게이트를 여기서 다시 거는 까닭 ──────────────────────────────────
//
// `#469` 가 고친 게이트(`shouldTrackHere`)는 **페이지뷰에만** 걸려 있다.
// `logAdvEvent` 는 측정 ID 만 보고 쏘므로 e2e·localhost 에서도 이벤트가 나간다 —
// #469 가 잡은 것과 **같은 오염**이 이벤트 쪽에 남아 있는 것이다.
//
// 이 표는 A/B 의 근거라 오염되면 결론이 통째로 틀린다. 그래서 여기서만이라도
// 먼저 게이트를 본다. (`logAdvEvent` 전체에 다는 것은 기존 이벤트의 동작을 바꾸는
// 일이라 별도로 낸다.)
//
// **실패는 삼킨다** — 표 하나 때문에 엔딩 화면이 깨지면 안 된다.

import { shouldTrackHere } from '@/lib/analytics-gate';
import { logAdvEvent } from '@/lib/web-adventure/analytics';
import type { VoteRecord } from './ui-vote';

export const VOTE_KEY = 'eternia-refine:ui-votes';

/** 너무 쌓이지 않게. 한 사람의 기록이라 이 정도면 넉넉하다. */
const KEEP = 200;

/** 지금까지의 표 — 본인 기기 것. */
export function readVotes(): VoteRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(VOTE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as VoteRecord[]) : [];
  } catch {
    return [];
  }
}

/** 한 표를 남긴다. 어디에도 못 남겨도 조용히 지나간다. */
export function submitVote(record: VoteRecord): void {
  if (typeof window === 'undefined') return;

  try {
    const prev = readVotes();
    window.localStorage.setItem(VOTE_KEY, JSON.stringify([...prev.slice(-(KEEP - 1)), record]));
  } catch {
    /* 저장 실패가 화면을 막지 않는다 */
  }

  // 운영 호스트에서 사람이 볼 때만 센다 (#469).
  if (!shouldTrackHere()) return;
  logAdvEvent('refine_ui_vote', {
    variant: record.variant,
    layout: record.layout,
    face: record.face,
    vote: record.vote,
    ending_id: record.endingId,
    protagonist: record.protagonist,
    cleared: record.cleared,
    stigma_erosion: record.erosion,
  });
}

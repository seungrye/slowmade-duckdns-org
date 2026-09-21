// 조작 평가 한 표 (#475) — 순수.
//
// 아홉 조합을 굴려 봐도 **어느 쪽이 나은지는 플레이한 사람만 안다.** 그래서 회차가
// 끝나는 자리에서 👍/👎 한 번만 받는다.
//
// ── 왜 엔딩인가 ────────────────────────────────────────────────────
//
// 전투 중에 물으면 판을 끊고, 그 순간의 승패에 답이 휘어진다. 회차가 끝난 자리는
// 이미 손을 떼는 자리라 끊을 것이 없고, 그 조작으로 한 판을 다 굴려 본 뒤다.
//
// ── 무엇을 함께 싣나 ───────────────────────────────────────────────
//
// 변종만 담으면 「👎 가 3표」에서 멈춘다. 엔딩·주인공·클리어 여부를 같이 실어야
// 「진 판에서만 👎 였다」 같은 것이 보인다 — 조작이 나쁜 것과 회차가 나빴던 것은 다르다.

import type { EndingId, Protagonist } from './types';

export type Vote = 'up' | 'down';

export interface VoteRecord {
  v: 1;
  /** `rail:sigil` 같은 조합 id. */
  variant: string;
  layout: string;
  face: string;
  vote: Vote;
  endingId: EndingId;
  protagonist: Protagonist;
  /** 끝까지 갔나 — 진 판의 불만이 조작 탓으로 새는 것을 갈라 보려고. */
  cleared: boolean;
  /** 최종 침식. 험한 회차였는지 가늠한다. */
  erosion: number;
  /** 밀리초. 호출하는 쪽이 준다 — 이 모듈은 시계를 모른다. */
  ts: number;
}

export interface VoteInput {
  variantId: string;
  layout: string;
  face: string;
  vote: Vote;
  endingId: EndingId;
  protagonist: Protagonist;
  cleared: boolean;
  erosion: number;
  now: number;
}

/** 한 표를 기록 모양으로. 보내지는 않는다 — 그건 `vote-sink` 몫이다. */
export function buildVote(input: VoteInput): VoteRecord {
  return {
    v: 1,
    variant: input.variantId,
    layout: input.layout,
    face: input.face,
    vote: input.vote,
    endingId: input.endingId,
    protagonist: input.protagonist,
    cleared: input.cleared,
    erosion: input.erosion,
    ts: input.now,
  };
}

/**
 * 조합별 찬반을 센다 — 쌓인 표를 읽을 때.
 *
 * 표가 적을 때 비율만 보면 1승 0패가 100% 로 보인다. 그래서 **수를 같이** 낸다.
 */
export function tally(votes: readonly VoteRecord[]): Map<string, { up: number; down: number }> {
  const out = new Map<string, { up: number; down: number }>();
  for (const v of votes) {
    const cur = out.get(v.variant) ?? { up: 0, down: 0 };
    if (v.vote === 'up') cur.up += 1;
    else cur.down += 1;
    out.set(v.variant, cur);
  }
  return out;
}

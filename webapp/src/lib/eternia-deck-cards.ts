// 에테르니아 덱빌딩 로그라이크 — 카드 데이터.
//
// effect 는 함수가 아니라 **태그**다. 함수 참조로 두면 나중에 저장·재생을 붙일 때
// 직렬화가 막힌다.
//
// 코드 안쪽 식별자는 영문이고 한글은 name 값에만 둔다. 그래야 카드를 늘릴 때 데이터만
// 고치면 된다.
//
// ── 1 차 껍데기 ────────────────────────────────────────────────────────────
// 타입만 두고 CARDS / STARTER_DECK 은 **비워 둔다**. 여덟 장의 이름·비용·수치는 스펙에
// 표로 못박혀 있고, 그 표를 지키는 일은 코더 몫이다 —
// eternia-deck-combat.test.ts 가 표를 글자 그대로 들고 있으니 채우면 초록이 된다.

/** 카드 효과의 종류. 1 차는 damage 와 block 둘뿐이다 (draw 는 2 차). */
export type CardKind = "damage" | "block";

/** 카드 식별자. 영문 소문자와 밑줄만 쓴다. */
export type CardId = string;

/** 효과 태그 — 함수가 아니라 값이라야 직렬화를 건넌다. */
export type CardEffect = {
  kind: CardKind;
  amount: number;
};

/** 카드 한 장. name 만 한글이다. */
export type Card = {
  id: CardId;
  name: string;
  cost: number;
  effect: CardEffect;
};

/**
 * 카드 여덟 장.
 *
 * 껍데기라 비어 있다. 코더가 스펙의 표대로 채운다.
 */
export const CARDS: readonly Card[] = [];

/**
 * 시작 덱 — 위 여덟 장의 id 를 **한 장씩** 담은 목록.
 *
 * 여덟 장이라 손패 다섯 장을 두 번 뽑으면 바닥나고 버림 더미를 되돌려야 한다.
 * 그 경계를 일부러 만든 것이니 장수를 바꾸지 않는다.
 *
 * 껍데기라 비어 있다.
 */
export const STARTER_DECK: readonly CardId[] = [];

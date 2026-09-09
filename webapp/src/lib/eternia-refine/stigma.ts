// 침식 규칙 — 세계의 법칙은 web-adventure 에서 가져온다 (#419 → #427).
//
// ── 왜 공유인가 (비교 실험의 결론) ───────────────────────────────────
//
// #419 는 자체 구현과 엔진 공유를 같은 범위로 만들어 나란히 재는 작업이었다. 결론이
// 공유로 나서 #427 에서 자체 구현을 지웠다. 갈랐던 것은 「변경 추종」이다 —
// `STIGMA_DEBUFF_THRESHOLD` 를 50→40 으로 바꿔 보니 **공유 쪽만 따라왔다.** 침식
// 0~100·100 이면 석화라는 법칙이 한 곳에서만 정의되기 때문이다.
//
// 공유에 마찰이 있었고, 그건 고쳐서 없앴다. `applyStigmaDelta`·`isFullyPetrified` 가
// **Character 객체를 받고 복사본을 돌려주는** 모양이라, 침식을 숫자로만 다루는 덱빌더가
// 부르려면 관계없는 필드 8개(stats·inventory·rerollsLeft…)를 지어낸 껍데기가 필요했다.
// API 가 틀린 게 아니라 **안쪽이 안 열려 있던 것**이었다 — CYOA 는 캐릭터가 늘 통째로
// 있으니 Character 시그니처가 옳다. 그래서 web-adventure 쪽에 숫자 층(`clampErosion`·
// `isErosionMax`·`isErosionDebuffed`)을 꺼내고 Character 판이 그걸 감싸게 했다.
//
// 여기 남은 자체 구현은 **CYOA 에 대응물이 없는 것들뿐**이다:
//   crystalsGained — 결정선은 덱빌더 고유 개념이다.
//   effectiveDamage · bonusDraw — 성흔이 침식을 어떻게 읽는지는 카드 게임에만 있다.
//   무흔이 침식을 안 쌓는 규칙 — CYOA 의 무흔은 석화 면역일 뿐 수치는 오른다.
// 즉 이 중복은 공유의 한계가 아니라 **두 게임이 정말 다른 부분**이다.

import {
  STIGMA_MAX,
  STIGMA_DEBUFF_THRESHOLD,
  clampErosion,
  isErosionMax,
  isErosionDebuffed,
} from '@/lib/web-adventure/engine/stigma';
import type { Ability, Card } from './types';

export const EROSION_MAX = STIGMA_MAX;
export const EROSION_DEBUFF_AT = STIGMA_DEBUFF_THRESHOLD;
export const CRYSTAL_INTERVAL = 20;

const LUNA_DRAW_INTERVAL = 25;

/**
 * 침식 가감.
 *
 * 무흔 분기와 Infinity 정책은 여기서 얹는다 — CYOA 는 비유한 delta 를 0 으로 보는데
 * (손상된 저장값 방어), 덱빌더는 카드 데이터의 Infinity 를 "끝까지 민다"로 읽는 편이
 * 규칙 설명에 맞다. 세계의 법칙은 공유하되 게임의 해석은 각자 갖는 자리다.
 */
export function applyErosion(current: number, delta: number, ability?: Ability): number {
  if (!Number.isFinite(current)) return 0;
  if (!Number.isFinite(delta)) {
    if (delta === Number.POSITIVE_INFINITY) return ability === 'none' ? current : EROSION_MAX;
    if (delta === Number.NEGATIVE_INFINITY) return 0;
    return current;
  }
  if (ability === 'none' && delta > 0) return current;
  return clampErosion(current, delta);
}

/** 결정선 — CYOA 에 대응물이 없어 자체 구현. */
export function crystalsGained(before: number, after: number, interval = CRYSTAL_INTERVAL): number {
  if (after <= before || interval <= 0) return 0;
  return Math.floor(after / interval) - Math.floor(before / interval);
}

/** 석화. 무흔 면역은 CYOA 에 없는 규칙이라 여기서 얹는다. */
export function isPetrified(erosion: number, ability?: Ability): boolean {
  if (ability === 'none') return false;
  return isErosionMax(erosion);
}

export function erosionDebuff(erosion: number): number {
  return isErosionDebuffed(erosion) ? -2 : 0;
}

/** 성흔이 침식을 어떻게 읽는가 — 덱빌더 고유라 자체 구현. */
export function effectiveDamage(
  card: Pick<Card, 'damage' | 'scaling'>,
  erosion: number,
  ability: Ability,
): number {
  const base = card.damage ?? 0;
  if (!card.scaling || ability !== 'selene') return base;
  return base + Math.floor(erosion / card.scaling);
}

export function bonusDraw(erosion: number, ability: Ability): number {
  if (ability !== 'lunar') return 0;
  return Math.floor(erosion / LUNA_DRAW_INTERVAL);
}

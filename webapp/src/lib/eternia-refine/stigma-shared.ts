// 침식 규칙 — B안(엔진 공유) (#419).
//
// A안(`stigma.ts`)과 **같은 규칙, 다른 출처**다. 여기서는 web-adventure 의 것을 가져다 쓰고,
// `stigma.test.ts` 를 둘이 함께 통과한다.
//
// ── 실제로 공유해 보니 (비교용 기록) ─────────────────────────────────
//
// 공짜로 얻은 것:
//   STIGMA_MAX · STIGMA_DEBUFF_THRESHOLD — 상수라 그냥 import 하면 끝난다.
//
// 어댑터가 필요했던 것:
//   `applyStigmaDelta`·`isFullyPetrified` 는 **Character 객체를 받고 복사본을 돌려준다.**
//   덱빌더는 침식을 그냥 숫자로 다루므로, 부르려면 관계없는 필드 8개(stats·inventory·
//   rerollsLeft…)를 지어내 껍데기를 만들어야 한다. 아래 `asCharacter` 가 그 비용이다.
//   CYOA 는 캐릭터가 늘 통째로 있으니 그 모양이 옳고, 잘못 만든 API 가 아니다 — 다만
//   **모양이 다른 소비자에게는 그대로 안 맞는다**는 것이 이 비교의 관찰이다.
//
// 못 가져온 것 (CYOA 에 대응물이 없어 자체 구현):
//   crystalsGained — 결정선은 덱빌더 고유 개념이다.
//   effectiveDamage · bonusDraw — 성흔이 침식을 어떻게 읽는지는 카드 게임에만 있다.
//   **무흔이 침식을 안 쌓는 규칙** — CYOA 의 무흔은 석화 면역일 뿐 침식 수치는 오른다.
//   그래서 B안도 이 분기는 직접 얹어야 했다.

import type { Character } from '@/types/web-adventure';
import {
  STIGMA_MAX,
  STIGMA_DEBUFF_THRESHOLD,
  applyStigmaDelta,
  isFullyPetrified,
} from '@/lib/web-adventure/engine/stigma';
import type { Ability, Card } from './types';

export const EROSION_MAX = STIGMA_MAX;
export const EROSION_DEBUFF_AT = STIGMA_DEBUFF_THRESHOLD;
export const CRYSTAL_INTERVAL = 20;

const LUNA_DRAW_INTERVAL = 25;

/**
 * 숫자 하나를 Character 껍데기로 감싼다 — 공유의 실제 비용.
 *
 * `applyStigmaDelta` 가 Character 를 받으므로 이 8줄이 필요하다. 나머지 필드는 침식
 * 계산에 쓰이지 않지만 타입이 요구한다.
 */
function asCharacter(erosion: number): Character {
  return {
    stats: { str: 0, dex: 0, int: 0, cha: 0, con: 0, wis: 0 },
    hp: 1,
    maxHp: 1,
    ability: 'none',
    protagonist: 'kael',
    stigmaErosion: erosion,
    inventory: [],
    flags: {},
    rerollsLeft: 0,
  };
}

/** A안과 같은 계약. 무흔 분기는 CYOA 에 없어 여기서 얹는다. */
export function applyErosion(current: number, delta: number, ability?: Ability): number {
  if (!Number.isFinite(current)) return 0;
  if (!Number.isFinite(delta)) {
    if (delta === Number.POSITIVE_INFINITY) return ability === 'none' ? current : EROSION_MAX;
    if (delta === Number.NEGATIVE_INFINITY) return 0;
    return current;
  }
  if (ability === 'none' && delta > 0) return current;
  return applyStigmaDelta(asCharacter(current), delta).stigmaErosion;
}

/** 결정선 — CYOA 에 대응물이 없어 자체 구현. */
export function crystalsGained(before: number, after: number, interval = CRYSTAL_INTERVAL): number {
  if (after <= before || interval <= 0) return 0;
  return Math.floor(after / interval) - Math.floor(before / interval);
}

/** 석화. 무흔 면역은 CYOA 의 뜻과 같지만 그 판정이 함수 밖에 있어 여기서 얹는다. */
export function isPetrified(erosion: number, ability?: Ability): boolean {
  if (ability === 'none') return false;
  return isFullyPetrified(asCharacter(erosion));
}

export function erosionDebuff(erosion: number): number {
  return erosion >= EROSION_DEBUFF_AT ? -2 : 0;
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

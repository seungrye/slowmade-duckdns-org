// 침식 규칙 — A안(별도 구현) (#419).
//
// **의도적으로 web-adventure 를 참조하지 않는다.** B안(`stigma-shared.ts`)이 같은 규칙을
// `lib/web-adventure/engine/stigma.ts` 에서 import 해 오고, 그 둘을 나란히 놓고 재는 것이
// 이 작업의 목적이다. 여기서 공유해 버리면 비교가 성립하지 않는다.
//
// 두 구현은 `stigma.test.ts` 를 **함께** 통과해야 한다.

import type { Ability, Card } from './types';

/** 여기 닿으면 굳는다. */
export const EROSION_MAX = 100;

/** 이 간격을 넘을 때마다 결정 1장이 덱에 섞인다. 억제기를 차면 벌어진다. */
export const CRYSTAL_INTERVAL = 20;

/** 이 이상이면 con/dex 판정에 벌점. */
export const EROSION_DEBUFF_AT = 50;

/** 루나는 이 간격마다 카드를 한 장 더 본다. */
const LUNA_DRAW_INTERVAL = 25;

/**
 * 침식을 가감하고 0..100 으로 자른다.
 *
 * 무흔(none)은 **오르지 않는다** — 마력을 거절한 자라 새길 성흔이 없다. 다만 내려가는 것은
 * 받는다(정제수를 못 쓸 이유가 없다).
 *
 * ```
 * applyErosion(36, 12)          -> 48
 * applyErosion(36, 12, 'none')  -> 36   (안 오른다)
 * applyErosion(36, -6, 'none')  -> 30   (내려가는 건 받는다)
 * ```
 */
export function applyErosion(current: number, delta: number, ability?: Ability): number {
  if (!Number.isFinite(current)) return 0;
  if (!Number.isFinite(delta)) {
    // Infinity 는 방향만 살려 끝까지 민다. NaN 은 그대로 둔다.
    if (delta === Number.POSITIVE_INFINITY) return ability === 'none' ? current : EROSION_MAX;
    if (delta === Number.NEGATIVE_INFINITY) return 0;
    return current;
  }
  if (ability === 'none' && delta > 0) return current;
  return Math.max(0, Math.min(EROSION_MAX, current + delta));
}

/**
 * 결정선을 몇 번 넘었나 = 덱에 섞일 결정의 수.
 *
 * 내려갈 때는 주지 않는다 — 정제수로 침식을 내렸는데 결정이 생기면 앞뒤가 안 맞는다.
 *
 * ```
 * crystalsGained(36, 41)      -> 1   (40 하나)
 * crystalsGained(36, 62)      -> 2   (40, 60)
 * crystalsGained(0, 28, 28)   -> 1   (억제기 — 간격이 28)
 * ```
 */
export function crystalsGained(before: number, after: number, interval = CRYSTAL_INTERVAL): number {
  if (after <= before || interval <= 0) return 0;
  return Math.floor(after / interval) - Math.floor(before / interval);
}

/** 굳었나. 무흔은 굳지 않는다 — 성흔이 없으니 결정도 없다. */
export function isPetrified(erosion: number, ability?: Ability): boolean {
  if (ability === 'none') return false;
  return erosion >= EROSION_MAX;
}

/** 침식이 깊으면 몸이 말을 안 듣는다. */
export function erosionDebuff(erosion: number): number {
  return erosion >= EROSION_DEBUFF_AT ? -2 : 0;
}

/**
 * 이 카드가 실제로 낼 피해.
 *
 * `scaling` 은 셀레네 전용이다 — 굳을수록 주먹이 무거워진다는 그 성흔의 읽기라,
 * 다른 성흔이 들면 그냥 고정 피해다. 카드가 아니라 **성흔이 그 효과의 자격**이다.
 *
 * ```
 * effectiveDamage({damage:9, scaling:10}, 88, 'selene') -> 17
 * effectiveDamage({damage:9, scaling:10}, 88, 'lunar')  -> 9
 * ```
 */
export function effectiveDamage(
  card: Pick<Card, 'damage' | 'scaling'>,
  erosion: number,
  ability: Ability,
): number {
  const base = card.damage ?? 0;
  if (!card.scaling || ability !== 'selene') return base;
  return base + Math.floor(erosion / card.scaling);
}

/** 루나는 침식에서 지식을 읽는다 — 굳을수록 한 수 더 본다. */
export function bonusDraw(erosion: number, ability: Ability): number {
  if (ability !== 'lunar') return 0;
  return Math.floor(erosion / LUNA_DRAW_INTERVAL);
}

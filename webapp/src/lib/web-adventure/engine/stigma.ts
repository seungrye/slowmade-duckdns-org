// 〈에테르니아의 추락〉 성흔 침식 메커니즘 (#250).
//
// 외부 AI 기획안 매핑:
//   0-49 : 정상.
//   50-79: 디버프 — con/dex 판정 -2, 셀레네(selene) 마법 위력 +3 (rollDice 에서 별도).
//   80-99: 임계 — 디버프 유지 + UI 경고 (텍스트/색상).
//   100  : 자동 petrification 엔딩 전환.

import type { Character, StatKey } from "@/types/web-adventure";

/** 침식 디버프 임계값. */
export const STIGMA_DEBUFF_THRESHOLD = 50;
/** 침식 임계 (UI 경고) 임계값. */
export const STIGMA_CRITICAL_THRESHOLD = 80;
/** 침식 최대치 = 자동 petrification. */
export const STIGMA_MAX = 100;

/**
 * 침식도가 임계값 이상이면 con/dex 판정에 -2 디버프.
 * 다른 스탯(str/int/cha/wis)에는 영향 없음.
 */
export function stigmaDebuff(character: Character, stat: StatKey): number {
  if (character.stigmaErosion < STIGMA_DEBUFF_THRESHOLD) return 0;
  if (stat === "con" || stat === "dex") return -2;
  return 0;
}

/**
 * 침식도 가감 — clamp [0, 100]. character 의 *복사본* 반환.
 *
 * #290 NaN/Infinity 방어 — 옛 localStorage 또는 손상된 입력에서 NaN 이 들어오면
 * `??` 가 차단 못 함 (NaN 은 nullish 아님). Math.max(0, Math.min(100, NaN)) = NaN
 * → character 전체 부정. 시작과 delta 양쪽 *유한 number 만* 허용.
 */
export function applyStigmaDelta(character: Character, delta: number): Character {
  const safeStart = Number.isFinite(character.stigmaErosion) ? character.stigmaErosion : 0;
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  const next = Math.max(0, Math.min(STIGMA_MAX, safeStart + safeDelta));
  return { ...character, stigmaErosion: next };
}

/** 침식도 100 도달 → 자동 petrification 엔딩. */
export function isFullyPetrified(character: Character): boolean {
  return character.stigmaErosion >= STIGMA_MAX;
}

/**
 * #318 — HP 0 도달 → 자동 fall 엔딩.
 * 시나리오 ending (caught/chase 등) 은 *진짜 막다른 결정* 에만, 대부분의 game over 는
 * HP/침식 누적으로.
 */
export function isDead(character: Character): boolean {
  return character.hp <= 0;
}

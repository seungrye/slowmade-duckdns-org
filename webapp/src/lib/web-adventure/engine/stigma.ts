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

/** 침식도 가감 — clamp [0, 100]. character 의 *복사본* 반환. */
export function applyStigmaDelta(character: Character, delta: number): Character {
  const next = Math.max(0, Math.min(STIGMA_MAX, character.stigmaErosion + delta));
  return { ...character, stigmaErosion: next };
}

/** 침식도 100 도달 → 자동 petrification 엔딩. */
export function isFullyPetrified(character: Character): boolean {
  return character.stigmaErosion >= STIGMA_MAX;
}

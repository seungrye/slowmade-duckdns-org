/**
 * 하루 타로 뽑기 — 순수·결정론 (#388).
 *
 * `hash(email + dateKey)` 로 카드와 방향을 정한다. **결정론이 핵심**이다:
 *  - 밤 배치가 실패해도, lazy 생성이 먼저 돌아도, 늘 같은 카드가 나온다.
 *  - 저장은 DailyFortune 이 하지만, 저장이 없어도 이 함수만으로 오늘 카드를 재현할 수 있다.
 *
 * 무작위(Math.random)를 쓰지 않는 이유가 그것이다 — 같은 날 같은 사람은 몇 번을 물어도
 * 같은 답이어야 한다.
 */
import { DECK_SIZE, type Orientation } from "./tarot-deck";

export interface DailyDraw {
  cardId: number;
  orientation: Orientation;
}

/** FNV-1a 32비트 — 짧고 분포가 고른 비암호 해시. 시드 재현용이라 보안 목적 아님. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // 32비트 곱(>>> 0 로 부호 없는 값 유지)
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function drawDailyCard(email: string, dateKey: string): DailyDraw {
  const seed = fnv1a(`${email.trim().toLowerCase()}|${dateKey}`);
  const cardId = seed % DECK_SIZE;
  // 카드 선택과 방향에 서로 다른 비트를 쓴다 — 한 값에서 둘 다 뽑으면 상관이 생긴다.
  const orientation: Orientation = fnv1a(`${dateKey}|${email}|rev`) % 2 === 0 ? "up" : "rev";
  return { cardId, orientation };
}

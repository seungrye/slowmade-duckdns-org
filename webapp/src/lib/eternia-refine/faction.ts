// 세력 동맹 (#430) — 하나를 고르면 나머지 둘이 닫힌다.
//
// 목업의 문장이 규칙 그대로다: **"동맹은 되돌릴 수 없다 — 고른 순간 나머지 둘의 카드가
// 재고에서 사라진다."** 그래서 2막의 이 한 번이 3막의 덱을 정한다.
//
// ── 왜 카드 풀을 줄이는가 ───────────────────────────────────────────
//
// 동맹에 "보너스를 준다" 로 만들면 고르지 않을 이유가 없어져 선택이 아니게 된다. **빼앗는
// 쪽**이라야 무게가 생긴다 — 아이언가드와 손잡는 순간 세계수의 길은 이번 회차에서 닫힌다.
//
// 엔딩 판정(`ending.ts:resolveEnding`)이 `ally` 를 그대로 읽으므로, 여기서 고른 값이 곧
// 결말의 한 갈래다. 판정 코드는 이미 그렇게 짜여 있고 이번에 **입력이 채워질 뿐**이다.

import type { Card, Faction } from './types';

export interface FactionDef {
  id: Faction;
  name: string;
  /** 고르는 자리에서 보여 줄 한 줄 — 무엇을 얻고 무엇을 닫는지. */
  reading: string;
}

export const FACTIONS: FactionDef[] = [
  {
    id: 'ironguard',
    name: '아이언가드',
    reading: '붉은 천을 두른 자들. 기관차를 멈춰 세우려 한다.',
  },
  {
    id: 'priesthood',
    name: '사제단',
    reading: '태우는 것이 축복이라 가르친다. 정제가 값싸진다.',
  },
  {
    id: 'sylvan',
    name: '네오엘프',
    reading: '결정을 태우지 않고 되돌리려 한다. 느리지만 깨끗하다.',
  },
];

export function factionName(id: Faction): string {
  return FACTIONS.find((f) => f.id === id)?.name ?? id;
}

/**
 * 이 동맹에서 나올 수 있는 카드들.
 *
 * 아직 안 골랐으면(`null`) **전부** 나온다 — 2막 전까지는 어느 길로도 갈 수 있다.
 * 고른 뒤에는 중립과 그 세력 것만 남는다.
 *
 * ```
 * allowedCards(null, pool)          -> pool 전부
 * allowedCards('sylvan', pool)      -> 중립 + sylvan
 * ```
 */
export function allowedCards(ally: Faction | null, pool: readonly Card[]): Card[] {
  if (ally === null) return [...pool];
  return pool.filter((c) => c.faction === undefined || c.faction === ally);
}

/** 고르면 닫히는 세력들 — 고르는 자리에서 대가를 먼저 보여 주려고. */
export function closedBy(ally: Faction): FactionDef[] {
  return FACTIONS.filter((f) => f.id !== ally);
}

// 세력 동맹 (#430) — 고르면 닫힌다.
//
// 이 규칙의 값어치는 **빼앗는 데** 있다. 보너스를 주는 쪽으로 만들면 고르지 않을 이유가
// 없어져 선택이 아니게 된다. 그래서 "나머지가 정말로 사라지는가" 를 못 박는다.

import { describe, it, expect } from 'vitest';
import { allowedCards, closedBy, FACTIONS, factionName } from './faction';
import type { Card, Faction } from './types';

const card = (id: string, faction?: Faction): Card => ({
  id,
  name: id,
  text: '',
  kind: 'tool',
  cost: 1,
  erosion: 0,
  faction,
});

const POOL: Card[] = [
  card('neutral-1'),
  card('neutral-2'),
  card('iron-1', 'ironguard'),
  card('priest-1', 'priesthood'),
  card('sylvan-1', 'sylvan'),
  card('sylvan-2', 'sylvan'),
];

describe('allowedCards', () => {
  it('아직 안 골랐으면 전부 나온다 — 2막 전까지는 어느 길로도 간다', () => {
    expect(allowedCards(null, POOL)).toHaveLength(POOL.length);
  });

  it('고르면 나머지 둘의 카드가 사라진다', () => {
    const ids = allowedCards('sylvan', POOL).map((c) => c.id);
    expect(ids).toContain('sylvan-1');
    expect(ids).not.toContain('iron-1');
    expect(ids).not.toContain('priest-1');
  });

  it('중립은 어느 동맹에서도 남는다', () => {
    for (const f of FACTIONS) {
      const ids = allowedCards(f.id, POOL).map((c) => c.id);
      expect(ids, f.id).toContain('neutral-1');
      expect(ids, f.id).toContain('neutral-2');
    }
  });

  it('원본을 건드리지 않는다 — 풀은 상수다', () => {
    const before = POOL.map((c) => c.id);
    allowedCards('ironguard', POOL);
    expect(POOL.map((c) => c.id)).toEqual(before);
  });

  it('세력 카드가 하나도 없어도 중립으로 굴러간다', () => {
    const onlyNeutral = [card('n1'), card('n2')];
    expect(allowedCards('priesthood', onlyNeutral)).toHaveLength(2);
  });
});

describe('closedBy — 고르기 전에 대가를 보여 준다', () => {
  it('고른 것 말고 둘이 닫힌다', () => {
    const closed = closedBy('ironguard').map((f) => f.id);
    expect(closed).toHaveLength(2);
    expect(closed).not.toContain('ironguard');
  });
});

describe('세력 정의', () => {
  it('셋이고, 엔딩 판정이 읽는 값과 같다', () => {
    expect(FACTIONS.map((f) => f.id)).toEqual(['ironguard', 'priesthood', 'sylvan']);
  });

  it('이름이 있다 — 화면이 id 를 그대로 쓰지 않게', () => {
    expect(factionName('sylvan')).toBe('네오엘프');
  });
});

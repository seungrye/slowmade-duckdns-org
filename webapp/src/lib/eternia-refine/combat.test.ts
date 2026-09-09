// 전투 리듀서 (#419).
//
// 여기서 지키려는 것은 전투의 재미가 아니라 **대가가 제때 돌아오는가**다. 성흔을 쓰면
// 결정이 그 자리에서 버림 더미로 들어가야 하고, 몇 턴 안에 손에 잡혀야 한다. 그래야
// "태웠다"가 숫자가 아니라 손패의 답답함으로 온다.

import { describe, it, expect } from 'vitest';
import { createCombat, shuffle, crystalCard, countCrystals, BASE_DRAW } from './combat';
import * as rules from './stigma';
import type { Card, Enemy } from './types';

// 리듀서는 규칙을 **주입받는다**(`createCombat`). 규칙이 한 벌만 남은 지금도 그 이음매는
// 남긴다 — 시험이 가짜 규칙을 끼워 전투만 따로 재는 자리이기 때문이다.

/** 항등 셔플 — Fisher-Yates 에서 j===i 가 되려면 rng 가 1 에 가까워야 한다.
 *  0 을 주면 매번 앞과 맞바꿔 덱이 뒤집힌다(처음에 그렇게 썼다가 걸렸다). */
const noShuffle = () => 0.9999999;

const strike: Card = {
  id: 'strike', name: '달의 각인', text: '', kind: 'stigma',
  cost: 1, erosion: 12, damage: 16,
};
const bandage: Card = {
  id: 'bandage', name: '군용 붕대', text: '', kind: 'tool',
  cost: 1, erosion: 0, heal: 8,
};
const guard: Card = {
  id: 'guard', name: '굳은 손', text: '', kind: 'tool',
  cost: 1, erosion: 0, blockPerCrystal: 5,
};

const dummy: Enemy = {
  id: 'bernat', name: '정화관 베르낫', maxHp: 100,
  intents: [{ damage: 13, erosion: 4, label: '정화' }],
};

function deckOf(n: number, card: Card): Card[] {
  return Array.from({ length: n }, (_, i) => ({ ...card, id: `${card.id}-${i}` }));
}

describe('전투 리듀서', () => {
  const { startCombat, playCard, endTurn, draw } = createCombat(rules);

  function fresh(over: Partial<Parameters<typeof startCombat>[0]> = {}) {
    return startCombat({
      deck: deckOf(10, strike),
      hp: 50, maxHp: 50, erosion: 36, ability: 'selene',
      enemy: dummy, rng: noShuffle, ...over,
    });
  }

  describe('startCombat', () => {
    it('기본 장수를 뽑는다', () => {
      expect(fresh().hand).toHaveLength(BASE_DRAW);
    });

    it('루나는 침식만큼 더 뽑는다 — 굳을수록 한 수 더 본다', () => {
      const s = fresh({ ability: 'lunar', erosion: 50 }); // 25 마다 +1 → +2
      expect(s.hand).toHaveLength(BASE_DRAW + 2);
    });

    it('정제한 만큼 보스가 커진다', () => {
      expect(fresh({ bossHpBonus: 24 }).enemyHp).toBe(dummy.maxHp + 24);
    });
  });

  describe('playCard', () => {
    it('피해가 들어가고 에테르가 준다', () => {
      const s = playCard(fresh(), 0, 'selene');
      expect(s.enemyHp).toBe(100 - (16 + Math.floor(36 / 10) * 0)); // scaling 없음 → 16
      expect(s.ether).toBe(2);
    });

    it('성흔을 쓰면 침식이 오른다', () => {
      expect(playCard(fresh(), 0, 'selene').erosion).toBe(48);
    });

    it('결정선을 넘으면 결정이 **버림 더미로** 들어간다 — 몇 턴 뒤 손에 잡히도록', () => {
      const s = playCard(fresh({ erosion: 36 }), 0, 'selene'); // 36 → 48, 40 넘음
      expect(countCrystals(s.discard)).toBe(1);
    });

    it('결정 카드는 낼 수 없다 — 상태가 그대로 돌아온다', () => {
      const before = fresh({ deck: [crystalCard(0), ...deckOf(9, strike)] });
      expect(playCard(before, 0, 'selene')).toBe(before);
    });

    it('에테르가 모자라면 낼 수 없다', () => {
      const poor = { ...fresh(), ether: 0 };
      expect(playCard(poor, 0, 'selene')).toBe(poor);
    });

    it('무흔은 성흔을 써도 침식이 오르지 않는다', () => {
      expect(playCard(fresh({ ability: 'none' }), 0, 'none').erosion).toBe(36);
    });

    it('손에 든 결정 수만큼 방어가 붙는다 — 결정을 자원으로 바꾸는 카드', () => {
      const s0 = fresh({ deck: [guard, crystalCard(1), crystalCard(2), ...deckOf(7, strike)] });
      expect(playCard(s0, 0, 'selene').block).toBe(10); // 손에 결정 2장
    });

    it('침식 100 이면 그 자리에서 굳는다', () => {
      const s = playCard(fresh({ erosion: 95 }), 0, 'selene');
      expect(s.outcome).toBe('petrified');
    });

    it('적을 눕히면 이긴다', () => {
      const s = playCard(fresh({ enemy: { ...dummy, maxHp: 10 } }), 0, 'selene');
      expect(s.outcome).toBe('win');
    });
  });

  describe('endTurn', () => {
    it('적이 때리고 침식을 올린다', () => {
      const s = endTurn(fresh(), 'selene', noShuffle);
      expect(s.hp).toBe(50 - 13);
      expect(s.erosion).toBe(40);
    });

    it('방어가 피해를 막고 턴을 넘기지 못한다', () => {
      const blocked = { ...fresh(), block: 20 };
      const s = endTurn(blocked, 'selene', noShuffle);
      expect(s.hp).toBe(50);
      expect(s.block).toBe(0);
    });

    it('손을 버리고 새로 뽑는다', () => {
      const s = endTurn(fresh(), 'selene', noShuffle);
      expect(s.hand).toHaveLength(BASE_DRAW);
      expect(s.turn).toBe(1);
    });

    it('체력이 0 이면 진다', () => {
      const s = endTurn({ ...fresh(), hp: 5 }, 'selene', noShuffle);
      expect(s.outcome).toBe('lose');
    });
  });

  describe('draw', () => {
    it('덱이 마르면 버림 더미를 섞어 되돌린다 — 그래서 결정이 반드시 돌아온다', () => {
      const s0 = { ...fresh({ deck: deckOf(5, strike) }), deck: [], discard: [crystalCard(9)] };
      const s = draw(s0, 1, noShuffle);
      expect(countCrystals(s.hand)).toBe(1);
      expect(s.discard).toHaveLength(0);
    });

    it('덱도 버림도 비면 그냥 멈춘다', () => {
      const s0 = { ...fresh(), deck: [], discard: [], hand: [] };
      expect(draw(s0, 3, noShuffle).hand).toHaveLength(0);
    });
  });

  describe('shuffle', () => {
    it('원본을 건드리지 않고 같은 것들을 돌려준다', () => {
      const src = deckOf(6, strike);
      const out = shuffle(src, () => 0.5);
      expect(out).not.toBe(src);
      expect(out.map((c) => c.id).sort()).toEqual(src.map((c) => c.id).sort());
    });
  });

  describe('도구 카드', () => {
    it('붕대는 회복만 하고 침식을 안 올린다', () => {
      const s = playCard(fresh({ deck: [bandage, ...deckOf(9, strike)], hp: 30 }), 0, 'selene');
      expect(s.hp).toBe(38);
      expect(s.erosion).toBe(36);
    });
  });
});

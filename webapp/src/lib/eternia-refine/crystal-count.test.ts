// 결정 카운트 (#463).
//
// 제보 스크린샷에서 손패의 「굳은 결정」 수와 카운터(`결정 N`)가 안 맞아 보였다. 다만 화면이
// 삼성 브라우저 강제 다크로 색이 뒤집혀 있어 카드 종류를 색으로 못 가렸고, 몇 장이 결정인지
// 확실히 못 읽었다. **그래서 먼저 재현을 시도한다.**
//
// 화면은 `countCrystals([...deck, ...discard, ...hand])` 로 센다. 세지 않는 더미가 하나 있다 —
// `exhausted`. 지금은 결정이 `exhaust` 를 안 달아 문제가 안 되지만, 소멸되는 결정이 생기면
// 조용히 어긋난다. 그 불변식을 여기서 못박는다.

import { describe, it, expect } from 'vitest';
import { createCombat, countCrystals, crystalCard } from './combat';
import * as rules from './stigma';
import { ENEMIES } from './content';
import { seeded } from './rng';
import type { Card, CombatState } from './types';

const combat = createCombat(rules);

/** 화면이 세는 방식 — `GameClient` 의 pile 카운터와 같은 식. */
const shown = (s: CombatState) => countCrystals([...s.deck, ...s.discard, ...s.hand]);

/** 판 위에 있는 **모든** 결정. exhausted 까지 센다. */
const actual = (s: CombatState) =>
  countCrystals([...s.deck, ...s.discard, ...s.hand, ...s.exhausted]);

function start(seed: number, deck: Card[]): CombatState {
  return combat.startCombat({
    deck,
    hp: 50, maxHp: 50, erosion: 40,
    ability: 'lunar',
    enemy: ENEMIES[2],
    bossHpBonus: 0,
    rng: seeded(seed),
  } as Parameters<typeof combat.startCombat>[0]);
}

describe('결정 카운트가 판과 어긋나지 않는다', () => {
  const deck: Card[] = [
    ...Array.from({ length: 4 }, (_, i) => crystalCard(i)),
    { id: 'a', name: '메스', text: '피해 6.', kind: 'tool', cost: 1, erosion: 0, damage: 6 },
    { id: 'b', name: '굳은 손', text: '방어 5.', kind: 'tool', cost: 1, erosion: 0, block: 5 },
    { id: 'c', name: '달의 각인', text: '피해 9.', kind: 'stigma', cost: 1, erosion: 8, damage: 9 },
    { id: 'd', name: '과부하', text: '피해 20.', kind: 'stigma', cost: 1, erosion: 22, damage: 20 },
  ];

  it('여러 턴을 돌려도 화면 수와 실제 수가 같다', () => {
    for (const seed of [1, 7, 42, 99, 2026]) {
      let s = start(seed, deck);
      for (let turn = 0; turn < 20 && !s.outcome; turn++) {
        // 낼 수 있는 것은 다 낸다 — 결정이 손에 쌓이는 상황을 만든다.
        for (let i = s.hand.length - 1; i >= 0; i--) {
          const c = s.hand[i];
          if (c.kind !== 'crystal' && (c.cost === null || c.cost <= s.ether)) {
            s = combat.playCard(s, i, 'lunar');
          }
        }
        expect(shown(s), `seed ${seed} turn ${turn} (낸 뒤)`).toBe(actual(s));
        s = combat.endTurn(s, 'lunar');
        expect(shown(s), `seed ${seed} turn ${turn} (턴 끝)`).toBe(actual(s));
      }
    }
  });

  it('손에 든 결정은 카운터에 반드시 포함된다', () => {
    for (const seed of [1, 7, 42]) {
      let s = start(seed, deck);
      for (let turn = 0; turn < 10 && !s.outcome; turn++) {
        const inHand = s.hand.filter((c) => c.kind === 'crystal').length;
        expect(shown(s), `seed ${seed} turn ${turn}`).toBeGreaterThanOrEqual(inHand);
        s = combat.endTurn(s, 'lunar');
      }
    }
  });

  it('소멸된 결정이 생기면 카운터가 어긋난다 — 그때를 위한 파수꾼', () => {
    // 지금은 결정에 exhaust 가 없다. 누가 붙이면 이 시험이 알려 준다.
    const s = start(1, deck);
    const withExhausted: CombatState = { ...s, exhausted: [crystalCard(99)] };
    expect(shown(withExhausted)).not.toBe(actual(withExhausted));
  });
});

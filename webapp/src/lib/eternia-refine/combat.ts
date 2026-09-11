// 전투 리듀서 — 순수 함수 (#419).
//
// 덱/드로우/버림, 카드 사용, 적의 턴. 화면도 난수원도 모른다 — rng 는 주입받는다.
// web-adventure 의 `engine/reducer.ts` 와 같은 방침이다(순수하게 두어야 시험 가능하다).
//
// 결정(crystal)이 여기서 어떻게 생기는지가 이 파일의 핵심이다: 성흔을 써서 침식이
// 결정선을 넘으면 **버림 더미로 곧장 들어간다.** 다음 사이클에 손에 잡힌다는 뜻이라,
// 태운 대가를 몇 턴 안에 몸으로 겪는다.

import type { Ability, Card, CombatState, Enemy } from './types';
import { withJosa } from './josa';

/**
 * 전투가 침식에 대해 알아야 하는 전부.
 *
 * `stigma.ts` 가 이 모양을 만족한다. 규칙이 한 벌만 남은 뒤에도 주입은 남긴다 —
 * 시험이 가짜 규칙을 끼워 **전투만 따로** 재는 자리이기 때문이다.
 */
export interface StigmaRules {
  EROSION_MAX: number;
  applyErosion(current: number, delta: number, ability?: Ability): number;
  crystalsGained(before: number, after: number, interval?: number): number;
  isPetrified(erosion: number, ability?: Ability): boolean;
  effectiveDamage(card: Pick<Card, 'damage' | 'scaling'>, erosion: number, ability: Ability): number;
  bonusDraw(erosion: number, ability: Ability): number;
}

/** 매 턴 뽑는 기본 장수. */
export const BASE_DRAW = 5;

/** 매 턴 주어지는 에테르. */
export const BASE_ETHER = 3;

/** 결정 카드 — 침식이 만들어 낸다. 쓸 수 없고 제거할 수 없다. */
export function crystalCard(seq: number): Card {
  return {
    id: `crystal-${seq}`,
    name: '굳은 결정',
    text: '쓸 수 없다. 손을 한 칸 차지한다.',
    kind: 'crystal',
    cost: null,
    erosion: 0,
  };
}

/** Fisher-Yates. rng 주입 — 시험에서 결정적으로 돌린다. */
export function shuffle<T>(xs: readonly T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface StartCombatInput {
  deck: Card[];
  hp: number;
  maxHp: number;
  erosion: number;
  ability: Ability;
  enemy: Enemy;
  /** 부유도시가 얹어 준 체력 — 정제한 만큼 보스가 커진다. */
  bossHpBonus?: number;
  rng?: () => number;
}

/**
 * 규칙을 물려 전투 함수 묶음을 만든다.
 *
 * ```
 * const combat = createCombat(rules);
 * ```
 */
export function createCombat(rules: StigmaRules) {
  const { applyErosion, crystalsGained, isPetrified, effectiveDamage, bonusDraw } = rules;

  function startCombat(input: StartCombatInput): CombatState {
    const rng = input.rng ?? Math.random;
    const enemyHp = input.enemy.maxHp + (input.bossHpBonus ?? 0);
    const state: CombatState = {
      hp: input.hp,
      maxHp: input.maxHp,
      block: 0,
      ether: BASE_ETHER,
      maxEther: BASE_ETHER,
      erosion: input.erosion,
      hand: [],
      deck: shuffle(input.deck, rng),
      discard: [],
      exhausted: [],
      enemy: input.enemy,
      enemyHp,
      enemyBlock: 0,
      turn: 0,
      outcome: null,
      log: [`${input.enemy.name} 이(가) 앞을 막는다.`],
    };
    return draw(state, BASE_DRAW + bonusDraw(input.erosion, input.ability), rng);
  }

  /** 덱에서 뽑는다. 덱이 마르면 버림 더미를 섞어 되돌린다. */
  function draw(state: CombatState, n: number, rng: () => number = Math.random): CombatState {
    let deck = [...state.deck];
    let discard = [...state.discard];
    const hand = [...state.hand];

    for (let i = 0; i < n; i++) {
      if (deck.length === 0) {
        if (discard.length === 0) break; // 더 뽑을 것이 없다
        deck = shuffle(discard, rng);
        discard = [];
      }
      hand.push(deck.shift()!);
    }
    return { ...state, deck, discard, hand };
  }

  /**
   * 카드를 낸다.
   *
   * 낼 수 없는 카드(결정·에테르 부족)는 **상태를 그대로 돌려준다** — 화면이 따로 막지
   * 않아도 되게. 호출측은 참조가 같은지로 "아무 일 없었음"을 알 수 있다.
   */
  function playCard(
    state: CombatState,
    handIndex: number,
    ability: Ability,
    rng: () => number = Math.random,
  ): CombatState {
    if (state.outcome) return state;
    const card = state.hand[handIndex];
    if (!card) return state;
    if (card.kind === 'crystal') return state; // 굳은 것은 낼 수 없다
    if (card.cost !== null && card.cost > state.ether) return state;

    let s: CombatState = {
      ...state,
      ether: state.ether - (card.cost ?? 0),
      hand: state.hand.filter((_, i) => i !== handIndex),
      log: [...state.log],
    };

    // 피해 — 적의 방어를 먼저 깎는다.
    const dmg = effectiveDamage(card, s.erosion, ability);
    if (dmg > 0) {
      const through = Math.max(0, dmg - s.enemyBlock);
      s.enemyBlock = Math.max(0, s.enemyBlock - dmg);
      s.enemyHp = Math.max(0, s.enemyHp - through);
    }

    if (card.block) s.block += card.block;
    if (card.blockPerCrystal) {
      const held = s.hand.filter((c) => c.kind === 'crystal').length;
      s.block += card.blockPerCrystal * held;
    }
    if (card.heal) s.hp = Math.min(s.maxHp, s.hp + card.heal);
    if (card.soothe) s.erosion = applyErosion(s.erosion, -card.soothe, ability);

    // 침식과 결정 — 이 게임의 값.
    if (card.erosion > 0) {
      const before = s.erosion;
      s.erosion = applyErosion(before, card.erosion, ability);
      const gained = crystalsGained(before, s.erosion);
      if (gained > 0) {
        const made = Array.from({ length: gained }, (_, i) => crystalCard(s.discard.length + i));
        s.discard = [...s.discard, ...made];
        s.log.push(`침식 ${before} → ${s.erosion} · 결정 ${gained}장이 덱에 섞였다.`);
      } else {
        s.log.push(`${card.name} — 침식 ${before} → ${s.erosion}.`);
      }
    } else {
      s.log.push(`${withJosa(card.name)} 썼다.`);
    }

    // 쓴 카드의 행방.
    if (card.exhaust) s.exhausted = [...s.exhausted, card];
    else s.discard = [...s.discard, card];

    if (card.draw) s = draw(s, card.draw, rng);

    return settle(s, ability);
  }

  /** 턴을 넘긴다 — 적이 움직이고, 손을 버리고, 다시 뽑는다. */
  function endTurn(
    state: CombatState,
    ability: Ability,
    rng: () => number = Math.random,
  ): CombatState {
    if (state.outcome) return state;

    const intent = state.enemy.intents[state.turn % state.enemy.intents.length];
    let s: CombatState = { ...state, log: [...state.log] };

    if (intent.block) s.enemyBlock += intent.block;

    if (intent.damage) {
      const through = Math.max(0, intent.damage - s.block);
      s.block = Math.max(0, s.block - intent.damage);
      s.hp = Math.max(0, s.hp - through);
      s.log.push(`${s.enemy.name}: ${intent.label} — ${through} 피해.`);
    }

    if (intent.erosion) {
      const before = s.erosion;
      s.erosion = applyErosion(before, intent.erosion, ability);
      const gained = crystalsGained(before, s.erosion);
      if (gained > 0) {
        const made = Array.from({ length: gained }, (_, i) => crystalCard(s.discard.length + i));
        s.discard = [...s.discard, ...made];
        s.log.push(`정화 의식 — 침식 ${before} → ${s.erosion}, 결정 ${gained}장.`);
      }
    }

    const settled = settle(s, ability);
    if (settled.outcome) return settled;

    // 손을 버리고 새로 뽑는다. 방어는 턴을 넘기지 못한다.
    s = {
      ...settled,
      discard: [...settled.discard, ...settled.hand],
      hand: [],
      block: 0,
      ether: settled.maxEther,
      turn: settled.turn + 1,
    };
    return draw(s, BASE_DRAW + bonusDraw(s.erosion, ability), rng);
  }

  /** 승패·석화를 확정한다. */
  function settle(s: CombatState, ability: Ability): CombatState {
    if (s.outcome) return s;
    if (isPetrified(s.erosion, ability)) {
      return { ...s, outcome: 'petrified', log: [...s.log, '침식 100 — 그 자리에서 굳는다.'] };
    }
    if (s.enemyHp <= 0) {
      return { ...s, outcome: 'win', log: [...s.log, `${s.enemy.name} 이(가) 쓰러졌다.`] };
    }
    if (s.hp <= 0) {
      return { ...s, outcome: 'lose', log: [...s.log, '쓰러졌다.'] };
    }
    return s;
  }

  return { startCombat, draw, playCard, endTurn };
}

export type Combat = ReturnType<typeof createCombat>;

/** 이번 회차에 만들어진 결정의 총수 — 엔딩 판정 입력. */
export function countCrystals(cards: readonly Card[]): number {
  return cards.filter((c) => c.kind === 'crystal').length;
}

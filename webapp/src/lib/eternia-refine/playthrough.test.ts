// 회차 완주 (#419) — 주인공 선택부터 엔딩까지 실제로 굴려 본다.
//
// 서버를 띄우지 않는 이유: `pnpm dev` 는 자동매매 스케줄러를 함께 띄워 실주문 위험이
// 있다. 게임을 확인하자고 그걸 켤 수는 없다. 그래서 화면이 부르는 것과 **같은 함수들**을
// 같은 순서로 불러 완주를 확인한다.
//
// 두 규칙(A안·B안) 모두로 돌린다 — 갈아끼워도 회차가 끝까지 가는지가 이 비교의 전제다.

import { describe, it, expect } from 'vitest';
import { createCombat, countCrystals } from './combat';
import * as ownRules from './stigma';
import * as sharedRules from './stigma-shared';
import {
  startRun,
  afterBattle,
  takeReward,
  burnCrystals,
  leaveRefinery,
  enemyFor,
  bonusHpFor,
} from './run';
import type { Session } from './run';
import type { Ability, CombatState, Protagonist } from './types';
import { ENDING_IDS } from '@/types/web-adventure';

const RULE_SETS = [
  ['A안 별도', ownRules],
  ['B안 공유', sharedRules],
] as const;

/** 결정적 rng — 회차마다 같은 길을 걷게 해서 실패를 재현할 수 있게. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

interface PlayOptions {
  protagonist: Protagonist;
  ability: Ability;
  /** 정제소마다 몇 장 태울까. 엔딩이 갈리는 손잡이. */
  burnPerShop: number;
  seed?: number;
}

/** 화면이 하는 일을 그대로 — 전투는 카드를 앞에서부터 낼 수 있는 만큼 내고 턴을 넘긴다. */
function play(rules: typeof ownRules, opts: PlayOptions) {
  const combat = createCombat(rules);
  const rng = seeded(opts.seed ?? 7);
  let session: Session = startRun(opts.protagonist, opts.ability);
  let guard = 0;

  while (session.phase.kind !== 'ending' && guard++ < 200) {
    const phase = session.phase;

    if (phase.kind === 'battle') {
      const enemy = enemyFor(phase.node)!;
      let b: CombatState = combat.startCombat({
        deck: session.run.deck,
        hp: session.run.hp,
        maxHp: session.run.maxHp,
        erosion: session.run.erosion,
        ability: session.run.ability,
        enemy,
        bossHpBonus: bonusHpFor(session, phase.node),
        rng,
      });

      let turns = 0;
      while (!b.outcome && turns++ < 60) {
        // 낼 수 있는 카드를 앞에서부터 전부 낸다.
        let played = true;
        while (played && !b.outcome) {
          played = false;
          for (let i = 0; i < b.hand.length; i++) {
            const next = combat.playCard(b, i, session.run.ability, rng);
            if (next !== b) {
              b = next;
              played = true;
              break;
            }
          }
        }
        if (!b.outcome) b = combat.endTurn(b, session.run.ability, rng);
      }

      expect(b.outcome).not.toBeNull(); // 무한 전투가 아니어야 한다
      session = afterBattle(
        session,
        phase.node,
        {
          hp: b.hp,
          erosion: b.erosion,
          deck: [...b.deck, ...b.discard, ...b.hand],
          outcome: b.outcome!,
        },
        rng,
      );
      continue;
    }

    if (phase.kind === 'reward') {
      session = takeReward(session, phase.node, phase.offers[0] ?? null);
      continue;
    }

    if (phase.kind === 'refinery') {
      session = burnCrystals(session, opts.burnPerShop);
      session = leaveRefinery(session, phase.node);
      continue;
    }
  }

  expect(session.phase.kind).toBe('ending');
  return session;
}

describe.each(RULE_SETS)('%s — 회차 완주', (_name, rules) => {
  it('린으로 끝까지 간다', () => {
    const s = play(rules, { protagonist: 'rin', ability: 'lunar', burnPerShop: 0 });
    if (s.phase.kind !== 'ending') throw new Error('엔딩이 아니다');
    expect(ENDING_IDS).toContain(s.phase.endingId);
    expect(s.run.path.length).toBeGreaterThan(0);
    expect(s.run.log.length).toBeGreaterThan(0);
  });

  it('카엘은 침식 80 에서 시작해 대개 굳는다 — 시한부가 규칙으로 드러난다', () => {
    const s = play(rules, { protagonist: 'kael', ability: 'selene', burnPerShop: 0 });
    if (s.phase.kind !== 'ending') throw new Error('엔딩이 아니다');
    expect(s.run.erosion).toBeGreaterThan(80);
  });

  it('많이 태우면 정제 누계가 쌓이고 도시가 자란다', () => {
    const s = play(rules, { protagonist: 'rin', ability: 'selene', burnPerShop: 9 });
    expect(s.run.refined).toBeGreaterThan(0);
    expect(s.run.cityPower).toBe(s.run.refined);
  });

  it('태운 결정은 덱에서 실제로 빠진다 — 다음 전투에 안 잡힌다', () => {
    const s = play(rules, { protagonist: 'rin', ability: 'selene', burnPerShop: 9 });
    // 정제소를 두 번 다 비웠으면 남은 결정은 마지막 전투에서 생긴 것뿐이다.
    expect(countCrystals(s.run.deck)).toBeLessThan(s.crystalsEverMade);
  });

  it('무흔은 침식이 오르지 않아 굳지 않는다', () => {
    const s = play(rules, { protagonist: 'rin', ability: 'none', burnPerShop: 0 });
    if (s.phase.kind !== 'ending') throw new Error('엔딩이 아니다');
    // 오르지 *않을* 뿐 내려가는 것은 받는다(정제수·세계수 뿌리) — 그래서 시작값 이하다.
    expect(s.run.erosion).toBeLessThanOrEqual(10);
    expect(s.phase.endingId).not.toBe('petrification');
  });
});

describe('두 규칙이 같은 회차를 낸다', () => {
  it('같은 씨앗이면 A안과 B안의 결과가 일치한다', () => {
    const opts = { protagonist: 'rin' as const, ability: 'selene' as const, burnPerShop: 2, seed: 42 };
    const a = play(ownRules, opts);
    const b = play(sharedRules, opts);

    if (a.phase.kind !== 'ending' || b.phase.kind !== 'ending') throw new Error('엔딩이 아니다');
    expect(b.phase.endingId).toBe(a.phase.endingId);
    expect(b.run.erosion).toBe(a.run.erosion);
    expect(b.run.refined).toBe(a.run.refined);
    expect(b.run.path).toEqual(a.run.path);
  });
});

// 회차 완주 (#419) — 주인공 선택부터 엔딩까지 실제로 굴려 본다.
//
// 서버를 띄우지 않는 이유: `pnpm dev` 는 자동매매 스케줄러를 함께 띄워 실주문 위험이
// 있다. 게임을 확인하자고 그걸 켤 수는 없다. 그래서 화면이 부르는 것과 **같은 함수들**을
// 같은 순서로 불러 완주를 확인한다.
//
// 화면이 부르는 규칙 한 벌로 돌린다(#427 이전에는 A안·B안 둘 다 돌렸다).

import { describe, it, expect } from 'vitest';
import { createCombat, countCrystals } from './combat';
import * as rules from './stigma';
import { seeded } from './rng';
import {
  startRun,
  afterBattle,
  takeReward,
  burnCrystals,
  leaveRefinery,
  enemyFor,
  bonusHpFor,
  choices,
  enterNode,
  chooseAlly,
} from './run';
import type { Session } from './run';
import type { Ability, CombatState, Faction, Protagonist } from './types';
import { ENDING_IDS } from '@/types/web-adventure';



/** 이 침식을 넘으면 성흔 카드를 아낀다 — 사람이 하는 판단. */
const CARE_AT = 70;

interface PlayOptions {
  protagonist: Protagonist;
  ability: Ability;
  /** 정제소마다 몇 장 태울까. 엔딩이 갈리는 손잡이. */
  burnPerShop: number;
  /** 2막에서 손잡을 세력. 엔딩이 갈리는 또 하나의 손잡이 (#430). */
  ally?: Faction;
  seed?: number;
}

/** 화면이 하는 일을 그대로 — 전투는 카드를 앞에서부터 낼 수 있는 만큼 내고 턴을 넘긴다. */
function play(opts: PlayOptions) {
  const combat = createCombat(rules);
  const rng = seeded(opts.seed ?? 7);
  let session: Session = startRun(opts.protagonist, opts.ability, opts.seed ?? 7);
  let guard = 0;

  while (session.phase.kind !== 'ending' && guard++ < 200) {
    const phase = session.phase;

    if (phase.kind === 'battle') {
      const enemy = enemyFor(session, phase.node)!;
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
            // **침식이 높으면 성흔을 아낀다.** 낼 수 있는 것을 전부 내던 때는 3막을 못 봤다 —
            // 게임이 어려운 게 아니라 이 플레이어가 무모했던 것이다(실측으로 갈랐다).
            // 침식 관리가 이 게임의 중심 결정이므로, 시험도 그걸 할 줄 알아야 한다.
            if (b.hand[i].erosion > 0 && b.erosion >= CARE_AT) continue;
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

    // 지도에서는 보스가 보이면 보스로, 아니면 첫 갈래로 — 사람이 하듯 앞으로만 간다.
    if (phase.kind === 'map') {
      const opts2 = choices(session);
      const boss = opts2.find((n) => n.kind === 'boss');
      session = enterNode(session, (boss ?? opts2[0]).id);
      continue;
    }

    if (phase.kind === 'alliance') {
      session = chooseAlly(session, opts.ally ?? 'ironguard');
      continue;
    }
  }

  expect(session.phase.kind).toBe('ending');
  return session;
}

describe('회차 완주', () => {
  it('린으로 3막을 끝까지 간다', () => {
    const s = play({ protagonist: 'rin', ability: 'lunar', burnPerShop: 0 });
    if (s.phase.kind !== 'ending') throw new Error('엔딩이 아니다');
    expect(ENDING_IDS).toContain(s.phase.endingId);
    expect(s.run.act).toBe(3);
    expect(s.run.path.length).toBeGreaterThan(0);
    expect(s.run.log.length).toBeGreaterThan(0);
  });

  it('카엘은 회차 내내 천장에 붙어 있다 — 시한부가 규칙으로 드러난다', () => {
    const s = play({ protagonist: 'kael', ability: 'selene', burnPerShop: 0 });
    // 침식 80 에서 시작하면 성흔을 쓸 여유가 없다. 조심하면 굳지 않을 수도 있지만
    // (그게 실력이다), **시작 조건이 회차 끝까지 따라온다** — 끝까지 천장 근처다.
    expect(s.run.erosion).toBeGreaterThanOrEqual(70);
  });

  it('많이 태우면 정제 누계가 쌓이고 도시가 자란다', () => {
    const s = play({ protagonist: 'rin', ability: 'selene', burnPerShop: 9 });
    expect(s.run.refined).toBeGreaterThan(0);
    expect(s.run.cityPower).toBe(s.run.refined);
  });

  it('태운 결정은 덱에서 실제로 빠진다 — 다음 전투에 안 잡힌다', () => {
    const s = play({ protagonist: 'rin', ability: 'selene', burnPerShop: 9 });
    expect(countCrystals(s.run.deck)).toBeLessThan(s.crystalsEverMade);
  });

  it('무흔은 침식이 오르지 않아 굳지 않는다', () => {
    const s = play({ protagonist: 'rin', ability: 'none', burnPerShop: 0 });
    if (s.phase.kind !== 'ending') throw new Error('엔딩이 아니다');
    // 오르지 *않을* 뿐 내려가는 것은 받는다(정제수·세계수 뿌리) — 그래서 시작값 이하다.
    expect(s.run.erosion).toBeLessThanOrEqual(10);
    expect(s.phase.endingId).not.toBe('petrification');
  });
});

// 씨앗 고정이 정말 재현을 주는지 — 실패한 회차를 다시 걷지 못하면 디버깅이 불가능하다.
describe('같은 씨앗은 같은 회차를 낸다', () => {
  it('두 번 돌려도 엔딩·침식·경로가 같다', () => {
    const opts = { protagonist: 'rin' as const, ability: 'selene' as const, burnPerShop: 2, seed: 42 };
    const a = play(opts);
    const b = play(opts);

    if (a.phase.kind !== 'ending' || b.phase.kind !== 'ending') throw new Error('엔딩이 아니다');
    expect(b.phase.endingId).toBe(a.phase.endingId);
    expect(b.run.erosion).toBe(a.run.erosion);
    expect(b.run.refined).toBe(a.run.refined);
    expect(b.run.path).toEqual(a.run.path);
  });
});

/**
 * **이번 작업(#430)의 성패가 여기 있다.**
 *
 * 엔딩 판정(`ending.ts`)은 원래부터 11종을 가르도록 짜여 있었는데, 슬라이스가 동맹을
 * 고르게 하지 않아 `ally` 가 늘 null 이었다. 그래서 실제로는 몇 종만 나왔다.
 * 동맹이 붙은 지금, **고른 세력이 결말을 실제로 바꾸는지**를 못 박는다.
 */
describe('동맹이 결말을 가른다', () => {
  const base = { protagonist: 'rin' as const, ability: 'lunar' as const, burnPerShop: 0, seed: 42 };

  it('아이언가드와 손잡으면 그 값이 회차에 남는다', () => {
    expect(play({ ...base, ally: 'ironguard' }).run.ally).toBe('ironguard');
  });

  it('세 동맹이 같은 씨앗에서 서로 다른 결말을 낸다', () => {
    const endings = (['ironguard', 'priesthood', 'sylvan'] as const).map((ally) => {
      const s = play({ ...base, ally });
      if (s.phase.kind !== 'ending') throw new Error('엔딩이 아니다');
      return s.phase.endingId;
    });
    // 같은 씨앗·같은 주인공인데 동맹만 다르다. 하나로 뭉치면 선택이 뜻이 없다는 뜻이다.
    expect(new Set(endings).size).toBeGreaterThan(1);
  });

  it('아이언가드를 끝까지 데려가면 혁명이다 — 판정이 ally 를 읽는 증거', () => {
    const s = play({ ...base, ally: 'ironguard', burnPerShop: 0 });
    if (s.phase.kind !== 'ending') throw new Error('엔딩이 아니다');
    // 굳거나 쓰러지면 그것이 먼저다(판정 순서). 끝까지 갔다면 혁명이어야 한다.
    if (s.run.erosion < 100 && s.run.hp > 0) expect(s.phase.endingId).toBe('revolution');
  });
});

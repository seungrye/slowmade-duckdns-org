// 회차 진행 (#419).
//
// 여기서 지키는 것은 **대가가 회차 밖으로 새지 않는가**다. 정제소에서 결정을 팔면 덱에서
// 실제로 빠져야 하고(숫자만 줄면 다음 전투에 그대로 잡힌다), 판 만큼 보스가 커져야 하고,
// 엔딩은 그 누계에서 읽혀야 한다.

import { describe, it, expect } from 'vitest';
import {
  startRun,
  afterBattle,
  takeReward,
  burnCrystals,
  leaveRefinery,
  finish,
  summarize,
  offerCards,
  enemyFor,
  isRefineryNode,
  bonusHpFor,
  toResult,
} from './run';
import { crystalCard, countCrystals } from './combat';
import { PROTAGONISTS, POOL } from './content';
import { ENDING_IDS } from '@/types/web-adventure';

const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('startRun', () => {
  it('주인공의 시작 침식을 그대로 받는다 — 시작 조건이 곧 난이도', () => {
    expect(startRun('kael', 'selene').run.erosion).toBe(80);
    expect(startRun('solwen', 'lunar').run.erosion).toBe(0);
  });

  it('카엘은 결정을 이미 안고 시작한다', () => {
    const s = startRun('kael', 'selene');
    const def = PROTAGONISTS.find((p) => p.id === 'kael')!;
    expect(countCrystals(s.run.deck)).toBe(def.startCrystals);
    expect(s.crystalsEverMade).toBe(def.startCrystals);
  });
});

describe('경로', () => {
  it('정제소 노드에는 적이 없다', () => {
    expect(enemyFor(0)).not.toBeNull();
    expect(enemyFor(1)).toBeNull();
    expect(isRefineryNode(1)).toBe(true);
    expect(isRefineryNode(2)).toBe(false);
  });

  it('보스에게만 도시 강화가 얹힌다', () => {
    const s = { ...startRun('rin', 'lunar') };
    s.run.cityPower = 3;
    expect(bonusHpFor(s, 2)).toBe(0);
    expect(bonusHpFor(s, 4)).toBeGreaterThan(0);
  });
});

describe('afterBattle', () => {
  it('이기면 보상으로 간다', () => {
    const s0 = startRun('rin', 'lunar');
    const s = afterBattle(s0, 0, { hp: 30, erosion: 20, deck: s0.run.deck, outcome: 'win' }, seq(0.1));
    expect(s.phase.kind).toBe('reward');
  });

  it('전투에서 생긴 결정을 누계에 더한다 — 엔딩 판정의 분모', () => {
    const s0 = startRun('rin', 'lunar');
    const deck = [...s0.run.deck, crystalCard(1), crystalCard(2)];
    const s = afterBattle(s0, 0, { hp: 30, erosion: 42, deck, outcome: 'win' }, seq(0.1));
    expect(s.crystalsEverMade).toBe(2);
  });

  it('굳으면 그 자리에서 회차가 끝난다', () => {
    const s0 = startRun('kael', 'selene');
    const s = afterBattle(s0, 0, { hp: 10, erosion: 100, deck: s0.run.deck, outcome: 'petrified' });
    expect(s.phase.kind).toBe('ending');
    if (s.phase.kind === 'ending') expect(s.phase.endingId).toBe('petrification');
  });

  it('마지막 노드를 이기면 클리어로 끝난다', () => {
    const s0 = startRun('solwen', 'lunar');
    const s = afterBattle(s0, 4, { hp: 20, erosion: 0, deck: s0.run.deck, outcome: 'win' });
    expect(s.phase.kind).toBe('ending');
  });
});

describe('takeReward', () => {
  it('고른 카드가 덱에 들어가고 다음 노드로', () => {
    const s0 = startRun('rin', 'lunar');
    const before = s0.run.deck.length;
    const s = takeReward(s0, 0, POOL[0]);
    expect(s.run.deck).toHaveLength(before + 1);
    expect(s.phase.kind).toBe('refinery'); // 노드 1 은 정제소
  });

  it('건너뛰어도 진행한다', () => {
    const s0 = startRun('rin', 'lunar');
    expect(takeReward(s0, 0, null).run.deck).toHaveLength(s0.run.deck.length);
  });
});

describe('offerCards', () => {
  it('무흔에게는 성흔 카드를 내밀지 않는다 — 살 수 없으니까', () => {
    const offers = offerCards('none', seq(0.1, 0.5, 0.9));
    expect(offers.every((c) => c.kind !== 'stigma')).toBe(true);
  });

  it('3장을 내민다', () => {
    expect(offerCards('lunar', seq(0.1, 0.5, 0.9))).toHaveLength(3);
  });
});

describe('burnCrystals — 정제소', () => {
  function withCrystals(n: number) {
    const s = startRun('rin', 'lunar');
    return {
      ...s,
      run: { ...s.run, deck: [...s.run.deck, ...Array.from({ length: n }, (_, i) => crystalCard(i))] },
      crystalsEverMade: n,
    };
  }

  it('덱에서 결정을 **실제로 뺀다** — 숫자만 줄면 다음 전투에 그대로 잡힌다', () => {
    const s = burnCrystals(withCrystals(4), 2);
    expect(countCrystals(s.run.deck)).toBe(2);
  });

  it('판 만큼 에테르와 도시가 오른다', () => {
    const s = burnCrystals(withCrystals(4), 2);
    expect(s.run.ether).toBeGreaterThan(0);
    expect(s.run.cityPower).toBe(2);
    expect(s.run.refined).toBe(2);
  });

  it('가진 것보다 많이 부르면 가진 만큼만 탄다', () => {
    const s = burnCrystals(withCrystals(2), 99);
    expect(s.run.refined).toBe(2);
    expect(countCrystals(s.run.deck)).toBe(0);
  });

  it('태울 것이 없으면 아무 일도 없다', () => {
    const s0 = withCrystals(0);
    expect(burnCrystals(s0, 3)).toBe(s0);
  });
});

describe('엔딩 판정이 회차 누계에서 나온다', () => {
  it('결정을 절반 넘게 팔면 승천', () => {
    const s0 = startRun('rin', 'lunar');
    const s = { ...s0, crystalsEverMade: 10, run: { ...s0.run, refined: 6 } };
    expect(finish(s, 'cleared').phase).toMatchObject({ endingId: 'ascension' });
  });

  it('아무것도 태우지 않고 끝내면 조화', () => {
    const s0 = startRun('solwen', 'lunar');
    expect(finish(s0, 'cleared').phase).toMatchObject({ endingId: 'harmony' });
  });

  it('석화는 침식을 100 으로 읽는다', () => {
    const s0 = startRun('kael', 'selene');
    expect(summarize(s0, 'petrified').erosion).toBe(100);
  });
});

describe('toResult — 깊은 공유의 이음매', () => {
  it('PastRun 이 받는 모양 그대로 낸다', () => {
    const s0 = startRun('rin', 'lunar');
    const s = leaveRefinery(takeReward(afterBattle(s0, 0, {
      hp: 30, erosion: 20, deck: s0.run.deck, outcome: 'win',
    }, seq(0.1)), 0, null), 1);
    const r = toResult(s, 'ascension');

    expect(ENDING_IDS).toContain(r.endingId);
    expect(Array.isArray(r.scenePath)).toBe(true);
    expect(Array.isArray(r.log)).toBe(true);
    expect(r.scenePath.length).toBeGreaterThan(0);
    expect(r.log.length).toBeGreaterThan(0);
  });
});

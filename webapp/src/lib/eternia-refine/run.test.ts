// 회차 진행 (#419 → #430).
//
// 여기서 지키는 것은 **대가가 회차 밖으로 새지 않는가**다. 정제소에서 결정을 팔면 덱에서
// 실제로 빠져야 하고(숫자만 줄면 다음 전투에 그대로 잡힌다), 판 만큼 보스가 커져야 하고,
// 엔딩은 그 누계에서 읽혀야 한다.
//
// #430 에서 노드가 숫자 순번 → **지도 노드 id** 로 바뀌었다. 갈래가 생기면서 "몇 번째"가
// 뜻을 잃었기 때문이다. 그래서 이 시험도 지도를 걸어서 노드를 얻는다.

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
  bonusHpFor,
  toResult,
  choices,
  enterNode,
  removeCard,
  removable,
  chooseAlly,
  isBossNode,
  type Session,
} from './run';
import { crystalCard, countCrystals } from './combat';
import type { ScenarioScene } from './scenario';
import { PROTAGONISTS, POOL } from './content';
import { ENDING_IDS } from '@/types/web-adventure';

const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

/** 씨앗 고정 회차 — 지도가 늘 같아 시험이 재현된다. */
const run = (p: 'kael' | 'rin' | 'solwen' = 'rin', a: 'lunar' | 'selene' | 'none' = 'lunar') =>
  startRun(p, a, 42);

/** 지금 자리에서 조건에 맞는 노드로 한 걸음. 없으면 첫 번째로. */
function step(s: Session, want?: (k: string) => boolean): Session {
  const opts = choices(s);
  const node = (want && opts.find((n) => want(n.kind))) ?? opts[0];
  return enterNode(s, node.id);
}

/** 보스 앞까지 걷는다 — 전투는 이긴 것으로 친다. */
function walkToBoss(s: Session): Session {
  let cur = s;
  for (let i = 0; i < 40; i++) {
    if (cur.phase.kind === 'map') {
      const opts = choices(cur);
      const boss = opts.find((n) => n.kind === 'boss');
      cur = enterNode(cur, (boss ?? opts[0]).id);
      continue;
    }
    if (cur.phase.kind === 'battle') {
      const node = cur.phase.node;
      if (isBossNode(cur, node)) return cur;
      cur = afterBattle(cur, node, {
        hp: cur.run.hp,
        erosion: cur.run.erosion,
        deck: cur.run.deck,
        outcome: 'win',
      });
      continue;
    }
    if (cur.phase.kind === 'reward') cur = takeReward(cur, cur.phase.node, null);
    else if (cur.phase.kind === 'refinery') cur = leaveRefinery(cur, cur.phase.node);
    else if (cur.phase.kind === 'alliance') cur = chooseAlly(cur, 'sylvan');
    else break;
  }
  return cur;
}

describe('startRun', () => {
  it('주인공의 시작 침식을 그대로 받는다 — 시작 조건이 곧 난이도', () => {
    expect(run('kael').run.erosion).toBe(PROTAGONISTS.find((p) => p.id === 'kael')!.startErosion);
  });

  it('카엘은 결정을 이미 안고 시작한다', () => {
    expect(countCrystals(run('kael').run.deck)).toBe(2);
  });

  it('1막 지도의 출발점에 서서 시작한다 — 고를 것 없는 탭을 만들지 않는다', () => {
    const s = run();
    expect(s.phase.kind).toBe('map');
    expect(s.run.act).toBe(1);
    expect(s.run.nodeId).toBe(s.map.nodes[0].id);
    // 첫 고름은 출발이 아니라 **그다음 갈래**여야 한다.
    expect(choices(s).every((n) => n.kind !== 'start')).toBe(true);
    expect(choices(s).length).toBeGreaterThan(0);
  });

  it('같은 씨앗이면 같은 지도 — 실패한 회차를 다시 걸을 수 있다', () => {
    expect(startRun('rin', 'lunar', 7).map).toEqual(startRun('rin', 'lunar', 7).map);
  });
});

describe('지도 걷기', () => {
  it('갈 수 있는 노드로만 들어간다 — 저장본을 손으로 고쳐도 막힌다', () => {
    const s = run();
    const far = s.map.nodes.find((n) => n.row === 4)!;
    expect(enterNode(s, far.id)).toBe(s); // 아무 일도 안 일어난다
  });

  it('전투 노드에 들어가면 적이 선다', () => {
    const s = step(run(), (k) => k === 'battle' || k === 'elite');
    if (s.phase.kind === 'battle') expect(enemyFor(s, s.phase.node)).not.toBeNull();
  });

  it('정제소 노드에는 적이 없다', () => {
    const s = run();
    const ref = s.map.nodes.find((n) => n.kind === 'refinery');
    if (ref) expect(enemyFor(s, ref.id)).toBeNull();
  });

  it('3막 보스에만 도시 강화가 얹힌다', () => {
    const s = run();
    const boss = s.map.nodes.find((n) => n.kind === 'boss')!;
    const rich = { ...s, run: { ...s.run, cityPower: 5 } };
    expect(bonusHpFor(rich, boss.id)).toBe(0); // 1막
    expect(bonusHpFor({ ...rich, run: { ...rich.run, act: 3 as const } }, boss.id)).toBeGreaterThan(0);
  });
});

describe('afterBattle', () => {
  it('이기면 보상으로 간다', () => {
    const s = step(run(), (k) => k === 'battle');
    if (s.phase.kind !== 'battle') return;
    const after = afterBattle(s, s.phase.node, {
      hp: 30, erosion: 20, deck: s.run.deck, outcome: 'win',
    });
    expect(after.phase.kind).toBe('reward');
  });

  it('전투에서 생긴 결정을 누계에 더한다 — 엔딩 판정의 분모', () => {
    const s = step(run(), (k) => k === 'battle');
    if (s.phase.kind !== 'battle') return;
    const deck = [...s.run.deck, crystalCard(1), crystalCard(2)];
    const after = afterBattle(s, s.phase.node, { hp: 30, erosion: 40, deck, outcome: 'win' });
    expect(after.crystalsEverMade).toBe(s.crystalsEverMade + 2);
  });

  it('굳으면 그 자리에서 회차가 끝난다', () => {
    const s = step(run(), (k) => k === 'battle');
    if (s.phase.kind !== 'battle') return;
    const after = afterBattle(s, s.phase.node, {
      hp: 10, erosion: 100, deck: s.run.deck, outcome: 'petrified',
    });
    expect(after.phase.kind).toBe('ending');
  });
});

describe('막 넘기', () => {
  it('보스 보상을 마치면 다음 막으로 — 지도가 새로 깔린다', () => {
    const atBoss = walkToBoss(run());
    if (atBoss.phase.kind !== 'battle') return;
    const won = afterBattle(atBoss, atBoss.phase.node, {
      hp: 30, erosion: 20, deck: atBoss.run.deck, outcome: 'win',
    });
    if (won.phase.kind !== 'reward') return;
    const next = takeReward(won, won.phase.node, null);
    expect(next.run.act).toBe(2);
    expect(next.phase.kind).toBe('map');
    expect(next.run.nodeId).toBe(next.map.nodes[0].id);
  });
});

describe('세력 동맹', () => {
  it('고르면 기록되고 지도로 돌아간다', () => {
    const at: Session = { ...run(), phase: { kind: 'alliance', node: '3-0' } };
    const after = chooseAlly(at, 'ironguard');
    expect(after.run.ally).toBe('ironguard');
    expect(after.phase.kind).toBe('map');
  });

  it('되돌릴 수 없다 — 두 번째는 무시된다', () => {
    const once = chooseAlly(run(), 'sylvan');
    expect(chooseAlly(once, 'priesthood').run.ally).toBe('sylvan');
  });

  it('동맹이 보상 풀을 줄인다 — 나머지 둘의 카드가 안 나온다', () => {
    const offers = offerCards('lunar', 'sylvan', seq(0.1, 0.5, 0.9, 0.2));
    for (const c of offers) {
      const src = POOL.find((p) => c.id.startsWith(p.id));
      expect(src?.faction === undefined || src?.faction === 'sylvan').toBe(true);
    }
  });
});

describe('offerCards', () => {
  it('무흔에게는 성흔 카드를 내밀지 않는다 — 살 수 없으니까', () => {
    expect(offerCards('none', null, seq(0.1, 0.5, 0.9)).every((c) => c.kind !== 'stigma')).toBe(true);
  });

  it('3장을 내민다', () => {
    expect(offerCards('lunar', null, seq(0.1, 0.5, 0.9, 0.3))).toHaveLength(3);
  });
});

describe('정제소', () => {
  const withCrystals = (n: number): Session => {
    const s = run();
    return {
      ...s,
      run: { ...s.run, deck: [...s.run.deck, ...Array.from({ length: n }, (_, i) => crystalCard(i))] },
    };
  };

  it('덱에서 결정을 **실제로 뺀다** — 숫자만 줄면 다음 전투에 그대로 잡힌다', () => {
    expect(countCrystals(burnCrystals(withCrystals(3), 2).run.deck)).toBe(1);
  });

  it('판 만큼 에테르와 도시가 오른다', () => {
    const after = burnCrystals(withCrystals(3), 2);
    expect(after.run.refined).toBe(2);
    expect(after.run.cityPower).toBe(2);
    expect(after.run.ether).toBeGreaterThan(0);
  });

  it('가진 것보다 많이 부르면 가진 만큼만 탄다', () => {
    expect(burnCrystals(withCrystals(2), 9).run.refined).toBe(2);
  });

  it('태울 것이 없으면 아무 일도 없다', () => {
    const s = withCrystals(0);
    expect(burnCrystals(s, 3)).toBe(s);
  });

  it('떠나면 지도로 돌아간다', () => {
    expect(leaveRefinery(withCrystals(1), '1-0').phase.kind).toBe('map');
  });
});

describe('엔딩 판정으로 넘기는 요약', () => {
  it('판 결정이 요약에 실린다', () => {
    const base = run();
    const s = burnCrystals(
      {
        ...base,
        crystalsEverMade: 4,
        run: { ...base.run, deck: [crystalCard(1), crystalCard(2), crystalCard(3), crystalCard(4)] },
      },
      3,
    );
    expect(summarize(s, 'cleared').refined).toBe(3);
    expect(finish(s, 'cleared').phase.kind).toBe('ending');
  });

  it('동맹을 요약에 싣는다 — 판정이 이걸 읽는다', () => {
    expect(summarize(chooseAlly(run(), 'ironguard'), 'cleared').ally).toBe('ironguard');
  });

  it('석화는 침식을 100 으로 읽는다', () => {
    expect(summarize(run(), 'petrified').erosion).toBe(100);
  });
});

describe('toResult', () => {
  it('PastRun 이 받는 모양 그대로 낸다', () => {
    const r = toResult(run(), 'harmony');
    expect(ENDING_IDS).toContain(r.endingId);
    expect(Array.isArray(r.scenePath)).toBe(true);
    expect(typeof r.cityPower).toBe('number');
  });
});

/**
 * 씬이 지도가 될 때 (#432).
 *
 * `Scene.onEnter` 가 덱빌더의 침식·체력에 **실제로** 얹히는지를 본다. 얹히지 않으면
 * 이야기는 장식일 뿐이고, 이 작업의 요지가 사라진다.
 */
describe('시나리오 지도', () => {
  const plain = (to: string) => ({ kind: 'plain', to });
  const SCENES: ScenarioScene[] = [
    { id: 'r', title: '가솔린 열차', body: ['기차가 선다.'], choices: [plain('a'), plain('b')] },
    { id: 'a', title: '강철', choices: [plain('c')], onEnter: { stigmaDelta: 9 } },
    { id: 'b', title: '지식', choices: [plain('c')], onEnter: { hpDelta: -7 } },
    { id: 'c', title: '외곽', choices: [plain('d')] },
    { id: 'd', title: '끝', choices: [] },
  ];

  const withScenes = () => startRun('rin', 'lunar', 42, SCENES);

  it('씬이 있으면 이야기가 지도가 된다 — 노드가 씬을 담는다', () => {
    const s = withScenes();
    expect(s.map.nodes.every((n) => typeof n.sceneId === 'string')).toBe(true);
    expect(s.map.nodes.some((n) => n.title === '가솔린 열차')).toBe(true);
  });

  it('씬이 없으면 절차 생성으로 물러선다 — 이야기 없이도 회차는 간다', () => {
    const s = startRun('rin', 'lunar', 42, null);
    expect(s.map.nodes.every((n) => n.sceneId === undefined)).toBe(true);
    expect(choices(s).length).toBeGreaterThan(0);
  });

  it('노드에 들어서면 씬의 침식이 얹힌다', () => {
    const s = withScenes();
    const target = choices(s).find((n) => n.sceneId === 'a');
    if (!target) return;
    expect(enterNode(s, target.id).run.erosion).toBe(s.run.erosion + 9);
  });

  it('씬의 체력 변화도 얹힌다', () => {
    const s = withScenes();
    const target = choices(s).find((n) => n.sceneId === 'b');
    if (!target) return;
    expect(enterNode(s, target.id).run.hp).toBe(s.run.hp - 7);
  });

  it('무흔은 씬 침식도 안 받는다 — 성흔 규칙을 그대로 통과한다', () => {
    const s = startRun('rin', 'none', 42, SCENES);
    const target = choices(s).find((n) => n.sceneId === 'a');
    if (!target) return;
    expect(enterNode(s, target.id).run.erosion).toBe(s.run.erosion);
  });
});

/**
 * 에테르로 카드 지우기 (#439).
 *
 * 이 게임에는 더하기만 있고 빼기가 없었다 — 전투마다 카드가 붙어 덱이 8→14~18장으로
 * 불어나는데 뺄 길은 결정뿐이었다. 그리고 정제로 쌓이는 에테르는 아무 데도 안 쓰였다.
 * 둘은 서로의 답이다.
 */
describe('에테르로 카드 지우기', () => {
  const rich = (ether: number): Session => {
    const s = run();
    return { ...s, run: { ...s.run, ether } };
  };

  it('에테르를 내고 덱에서 뺀다', () => {
    const s = rich(50);
    const target = s.run.deck.find((c) => c.kind !== 'crystal')!;
    const after = removeCard(s, target.id);
    expect(after.run.deck.length).toBe(s.run.deck.length - 1);
    expect(after.run.deck.some((c) => c.id === target.id)).toBe(false);
    expect(after.run.ether).toBe(50 - 18);
  });

  it('한 장만 지운다 — 같은 이름이 여럿이어도', () => {
    const s = rich(50);
    const name = s.run.deck[0].name;
    const before = s.run.deck.filter((c) => c.name === name).length;
    const after = removeCard(s, s.run.deck[0].id);
    expect(after.run.deck.filter((c) => c.name === name).length).toBe(before - 1);
  });

  it('에테르가 모자라면 아무 일도 없다', () => {
    const s = rich(17);
    expect(removeCard(s, s.run.deck[0].id)).toBe(s);
    expect(removable(s)).toHaveLength(0);
  });

  it('결정은 이 길로 못 지운다 — 태우는 것이 원래 길이다', () => {
    const base = rich(90);
    const s: Session = {
      ...base,
      run: { ...base.run, deck: [...base.run.deck, crystalCard(1)] },
    };
    const crystal = s.run.deck.find((c) => c.kind === 'crystal')!;
    expect(removeCard(s, crystal.id)).toBe(s);
    expect(removable(s).some((c) => c.kind === 'crystal')).toBe(false);
  });

  it('없는 카드를 부르면 아무 일도 없다 — 저장본을 고쳐도 막힌다', () => {
    const s = rich(90);
    expect(removeCard(s, '없는카드')).toBe(s);
  });

  it('덱을 통째로 비울 수는 있지만 도시가 그만큼 자란다 — 상한은 에테르가 아니다', () => {
    // 에테르는 결정을 태워야 나오고, 태우면 도시가 자란다. 그것이 진짜 값이다.
    const s = rich(18 * 3);
    let cur = s;
    for (let i = 0; i < 3; i++) {
      const t = removable(cur)[0];
      if (t) cur = removeCard(cur, t.id);
    }
    expect(cur.run.deck.length).toBe(s.run.deck.length - 3);
    expect(cur.run.ether).toBe(0);
    expect(removable(cur)).toHaveLength(0);
  });
});

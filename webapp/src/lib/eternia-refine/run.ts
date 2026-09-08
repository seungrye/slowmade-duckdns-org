// 회차 진행 — 전투·보상·정제소·엔딩을 잇는 순수 상태 기계 (#419).
//
// 화면은 이 함수들만 부른다. 난수는 주입받고 저장은 `RunSink` 뒤에 있어, 여기까지는
// 전부 시험 가능하다.
//
// 슬라이스 경로: 정거장(전투) → 정제소 → 의식장(전투) → 정제소 → 기관차(보스) → 엔딩.
// 전투를 이길 때마다 카드 보상이 한 번 낀다.

import type { Ability, Card, Protagonist, RunResult, RunState } from './types';
import { crystalCard, countCrystals } from './combat';
import { refine, bossHpBonus } from './refine';
import { resolveEnding, explainEnding } from './ending';
import type { RunSummary } from './ending';
import { ENEMIES, NODE_LABELS, POOL, PROTAGONISTS, STARTER } from './content';

/** 회차가 지금 어느 화면에 있는가. */
export type Phase =
  | { kind: 'select' }
  | { kind: 'battle'; node: number }
  | { kind: 'reward'; node: number; offers: Card[] }
  | { kind: 'refinery'; node: number }
  | { kind: 'ending'; endingId: RunResult['endingId']; why: string };

export interface Session {
  run: RunState;
  phase: Phase;
  /** 회차 동안 만들어진 결정의 총수 — 남은 것 + 판 것. 엔딩 판정 입력. */
  crystalsEverMade: number;
}

export function newSession(): Session {
  return {
    run: {
      protagonist: 'rin',
      ability: 'lunar',
      erosion: 0,
      hp: 50,
      maxHp: 50,
      ether: 0,
      deck: [],
      refined: 0,
      cityPower: 0,
      path: [],
      log: [],
      flags: {},
    },
    phase: { kind: 'select' },
    crystalsEverMade: 0,
  };
}

/** 주인공·성흔을 고르고 첫 전투로. */
export function startRun(protagonist: Protagonist, ability: Ability): Session {
  const def = PROTAGONISTS.find((p) => p.id === protagonist)!;
  const deck: Card[] = [
    ...STARTER.map((c, i) => ({ ...c, id: `${c.id}-${i}` })),
    ...Array.from({ length: def.startCrystals }, (_, i) => crystalCard(900 + i)),
  ];
  return {
    run: {
      protagonist,
      ability,
      erosion: def.startErosion,
      hp: def.maxHp,
      maxHp: def.maxHp,
      ether: 0,
      deck,
      refined: 0,
      cityPower: 0,
      path: [],
      log: [`${def.name} — ${def.title}. 침식 ${def.startErosion} 에서 시작한다.`],
      flags: {},
    },
    phase: { kind: 'battle', node: 0 },
    crystalsEverMade: def.startCrystals,
  };
}

/** 이번 노드의 적. 마지막은 정제한 만큼 커져 있다. */
export function enemyFor(node: number) {
  const order = [0, -1, 1, -1, 2];
  const idx = order[node];
  return idx >= 0 ? ENEMIES[idx] : null;
}

export function isRefineryNode(node: number): boolean {
  return enemyFor(node) === null;
}

export function nodeLabel(node: number): string {
  return NODE_LABELS[node] ?? '길';
}

/** 마지막 전투에 얹히는 보스 체력 — 판 결정이 키운 도시. */
export function bonusHpFor(session: Session, node: number): number {
  return node === 4 ? bossHpBonus(session.run.cityPower) : 0;
}

/** 보상으로 내밀 카드 3장. rng 주입. */
export function offerCards(ability: Ability, rng: () => number = Math.random): Card[] {
  // 무흔은 성흔 카드를 못 산다 — 마력을 거절한 자라서.
  const pool = ability === 'none' ? POOL.filter((c) => c.kind !== 'stigma') : POOL;
  const picked: Card[] = [];
  const rest = [...pool];
  for (let i = 0; i < 3 && rest.length > 0; i++) {
    picked.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
  }
  return picked.map((c, i) => ({ ...c, id: `${c.id}-r${i}-${Math.floor(rng() * 1e6)}` }));
}

/** 전투가 끝났다 — 결과를 회차에 반영하고 다음 화면을 정한다. */
export function afterBattle(
  session: Session,
  node: number,
  result: { hp: number; erosion: number; deck: Card[]; outcome: 'win' | 'lose' | 'petrified' },
  rng: () => number = Math.random,
): Session {
  const madeNow = countCrystals(result.deck) - countCrystals(session.run.deck);
  const run: RunState = {
    ...session.run,
    hp: result.hp,
    erosion: result.erosion,
    deck: result.deck,
    path: [...session.run.path, nodeLabel(node)],
    log: [...session.run.log, `${nodeLabel(node)} — ${outcomeWord(result.outcome)}.`],
  };
  const crystalsEverMade = session.crystalsEverMade + Math.max(0, madeNow);

  if (result.outcome !== 'win') {
    return finish({ ...session, run, crystalsEverMade }, result.outcome);
  }
  if (node >= 4) {
    return finish({ ...session, run, crystalsEverMade }, 'cleared');
  }
  return {
    run,
    crystalsEverMade,
    phase: { kind: 'reward', node, offers: offerCards(run.ability, rng) },
  };
}

function outcomeWord(o: 'win' | 'lose' | 'petrified'): string {
  if (o === 'win') return '이겼다';
  if (o === 'petrified') return '굳었다';
  return '쓰러졌다';
}

/** 보상 카드를 고르거나 건너뛴다. */
export function takeReward(session: Session, node: number, card: Card | null): Session {
  const run: RunState = card
    ? {
        ...session.run,
        deck: [...session.run.deck, card],
        log: [...session.run.log, `${card.name} 을(를) 가져갔다.`],
      }
    : { ...session.run, log: [...session.run.log, '아무것도 가져가지 않았다.'] };
  return { ...session, run, phase: nextAfter(node) };
}

function nextAfter(node: number): Phase {
  const next = node + 1;
  return isRefineryNode(next) ? { kind: 'refinery', node: next } : { kind: 'battle', node: next };
}

/**
 * 정제소에서 결정을 태운다.
 *
 * **덱에서 결정을 실제로 빼야 한다** — 숫자만 줄이면 다음 전투에서 그대로 손에 잡힌다.
 */
export function burnCrystals(session: Session, count: number): Session {
  const held = countCrystals(session.run.deck);
  const r = refine({
    crystalsLeft: held,
    count,
    ether: session.run.ether,
    refined: session.run.refined,
    cityPower: session.run.cityPower,
  });
  if (r.burned === 0) return session;

  let toRemove = r.burned;
  const deck = session.run.deck.filter((c) => {
    if (c.kind === 'crystal' && toRemove > 0) {
      toRemove -= 1;
      return false;
    }
    return true;
  });

  return {
    ...session,
    run: {
      ...session.run,
      deck,
      ether: r.ether,
      refined: r.refined,
      cityPower: r.cityPower,
      log: [
        ...session.run.log,
        `정제소 — 결정 ${r.burned}장을 태웠다. 부유도시 강화 ${r.cityPower}.`,
      ],
    },
  };
}

/** 정제소를 떠난다. */
export function leaveRefinery(session: Session, node: number): Session {
  return {
    ...session,
    run: { ...session.run, path: [...session.run.path, nodeLabel(node)] },
    phase: { kind: 'battle', node: node + 1 },
  };
}

/** 회차를 끝낸다 — 덱 상태를 읽어 엔딩을 정한다. */
export function finish(session: Session, how: 'cleared' | 'lose' | 'petrified'): Session {
  const summary = summarize(session, how);
  const endingId = resolveEnding(summary);
  return {
    ...session,
    phase: { kind: 'ending', endingId, why: explainEnding(summary, endingId) },
  };
}

export function summarize(session: Session, how: 'cleared' | 'lose' | 'petrified'): RunSummary {
  return {
    erosion: how === 'petrified' ? 100 : session.run.erosion,
    crystalsLeft: countCrystals(session.run.deck),
    refined: session.run.refined,
    crystalsEverMade: session.crystalsEverMade,
    cityPower: session.run.cityPower,
    sylvanCards: session.run.deck.filter((c) => c.name.includes('세계수')).length,
    ally: null,
    cleared: how === 'cleared',
  };
}

/** 회차 종료를 바깥으로 넘긴다 — 깊은 공유의 이음매. */
export function toResult(session: Session, endingId: RunResult['endingId']): RunResult {
  return {
    endingId,
    protagonist: session.run.protagonist,
    erosion: session.run.erosion,
    scenePath: session.run.path,
    log: session.run.log,
    flags: session.run.flags,
    refined: session.run.refined,
    cityPower: session.run.cityPower,
  };
}

/** 지금은 아무 데도 보내지 않는다. 깊은 공유 = 이 자리에 end-run POST 구현체를 넣는 것. */
export const localSink = {
  async submit(result: RunResult): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const key = 'eternia-refine:runs';
      const prev = JSON.parse(window.localStorage.getItem(key) ?? '[]') as RunResult[];
      window.localStorage.setItem(key, JSON.stringify([...prev.slice(-49), result]));
    } catch {
      /* 저장 실패가 회차를 막지 않는다 */
    }
  },
};

export { bossHpBonus, countCrystals };

// 회차 진행 — 전투·보상·정제소·엔딩을 잇는 순수 상태 기계 (#419).
//
// 화면은 이 함수들만 부른다. 난수는 주입받고 저장은 `RunSink` 뒤에 있어, 여기까지는
// 전부 시험 가능하다.
//
// 경로: 3막을 지난다 (#430). 막마다 씨앗에서 나온 **분기 지도**를 걷고, 고른 노드가
// 전투·정제소·사건·동맹이 된다. 막의 끝은 보스이고, 3막 보스를 넘으면 엔딩이다.
// 전투를 이길 때마다 카드 보상이 한 번 낀다.

import type { Ability, Act, Card, Faction, Protagonist, RunResult, RunState } from './types';
import { crystalCard, countCrystals } from './combat';
import { refine, bossHpBonus, ETHER_PER_REMOVAL } from './refine';
import { applyErosion } from './stigma';
import { resolveEnding, explainEnding } from './ending';
import type { RunSummary } from './ending';
import { actEnemies, bossFor, NODE_LABELS, POOL, PROTAGONISTS, STARTER } from './content';
import { makeMap, reachable, type ActMap } from './map';
import { scenarioMap, onEnterEffect, type ScenarioScene } from './scenario';
import { allowedCards } from './faction';
import { newSeed, seeded } from './rng';

/**
 * 회차가 지금 어느 화면에 있는가.
 *
 * `node` 는 지도 노드 id(`층-칸`)다 — 숫자 순번이던 것을 #430 에서 바꿨다. 지도가 갈래를
 * 가지면서 "몇 번째"가 뜻을 잃었기 때문이다.
 */
export type Phase =
  | { kind: 'title' }
  | { kind: 'select' }
  | { kind: 'map' }
  | { kind: 'battle'; node: string }
  | { kind: 'reward'; node: string; offers: Card[] }
  | { kind: 'refinery'; node: string }
  | { kind: 'alliance'; node: string }
  | { kind: 'story'; node: string }
  | { kind: 'ending'; endingId: RunResult['endingId']; why: string };

export interface Session {
  run: RunState;
  phase: Phase;
  /** 회차 동안 만들어진 결정의 총수 — 남은 것 + 판 것. 엔딩 판정 입력. */
  crystalsEverMade: number;
  /** 지금 막의 지도. 씨앗과 막에서 나오므로 저장할 필요가 없다(다시 만들면 같다). */
  map: ActMap;
  /**
   * 이야기 원본 (#432). 없으면 절차 생성 지도로 간다.
   *
   * 회차 상태가 아니라 **콘텐츠**다 — 저장할 것이 아니라 매번 받아 오면 되는 것이라
   * `RunState` 가 아니라 여기 둔다.
   */
  scenes: readonly ScenarioScene[] | null;
}

export function newSession(): Session {
  return {
    run: emptyRun(),
    phase: { kind: 'title' },
    crystalsEverMade: 0,
    map: makeMap(1, 0),
    scenes: null,
  };
}

function emptyRun(): RunState {
  return {
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
    act: 1,
    seed: 0,
    nodeId: null,
    ally: null,
  };
}

/** 타이틀에서 주인공 고르기로. */
export function beginSelect(session: Session): Session {
  return { ...session, phase: { kind: 'select' } };
}

/**
 * 주인공·성흔을 고르고 1막 지도로.
 *
 * 씨앗을 여기서 한 번 뽑는다 — 이후 지도도 보상도 전부 이 값에서 나오므로, 회차 전체가
 * 씨앗 하나로 재현된다.
 */
export function startRun(
  protagonist: Protagonist,
  ability: Ability,
  seed = newSeed(),
  scenes: readonly ScenarioScene[] | null = null,
): Session {
  const def = PROTAGONISTS.find((p) => p.id === protagonist)!;
  const map1 = mapFor(1, seed, scenes);
  const deck: Card[] = [
    ...STARTER.map((c, i) => ({ ...c, id: `${c.id}-${i}` })),
    ...Array.from({ length: def.startCrystals }, (_, i) => crystalCard(900 + i)),
  ];
  return {
    run: {
      ...emptyRun(),
      protagonist,
      ability,
      erosion: def.startErosion,
      hp: def.maxHp,
      maxHp: def.maxHp,
      deck,
      seed,
      // **출발 노드에 서서 시작한다.** null 로 두면 사람이 '출발' 을 한 번 눌러야 하는데,
      // 그건 고르는 것이 없는 탭이다. 목업도 플레이어를 출발점에 세워 두고 다음 갈래를
      // 고르게 한다.
      nodeId: map1.nodes[0].id,
      log: [`${def.name} — ${def.title}. 침식 ${def.startErosion} 에서 시작한다.`],
    },
    phase: { kind: 'map' },
    crystalsEverMade: def.startCrystals,
    map: map1,
    scenes,
  };
}

/**
 * 막의 지도를 만든다 (#432).
 *
 * 씬이 있으면 **이야기가 지도가 되고**(`scenario.ts`), 없거나 자를 수 없으면 절차 생성으로
 * 물러선다(`map.ts`). 폴백이 있어야 오프라인·API 장애에도 회차가 끝까지 간다.
 */
export function mapFor(act: Act, seed: number, scenes: readonly ScenarioScene[] | null): ActMap {
  return (scenes && scenarioMap(scenes, act, seed)) ?? makeMap(act, seed);
}

/** 지금 자리에서 갈 수 있는 노드들 — 화면이 누를 수 있는 것을 이걸로 정한다. */
export function choices(session: Session) {
  return reachable(session.map, session.run.nodeId);
}

/**
 * 노드로 들어간다. 종류가 다음 화면을 정한다.
 *
 * 갈 수 없는 노드면 **아무 일도 하지 않는다** — 화면이 막고 있지만, 규칙이 스스로도
 * 지켜야 저장본을 손으로 고친 경우까지 막힌다.
 */
export function enterNode(session: Session, nodeId: string): Session {
  if (!choices(session).some((n) => n.id === nodeId)) return session;
  const node = session.map.nodes.find((n) => n.id === nodeId)!;
  const at = { ...session, run: applySceneEffect({ ...session.run, nodeId }, session, node.sceneId) };
  const run = at.run;

  switch (node.kind) {
    case 'battle':
    case 'elite':
    case 'boss':
      return { ...at, phase: { kind: 'battle', node: nodeId } };
    case 'refinery':
      return { ...at, phase: { kind: 'refinery', node: nodeId } };
    case 'alliance':
      return { ...at, phase: { kind: 'alliance', node: nodeId } };
    // 사건에는 이야기가 붙는다 (#432). 씬이 없으면(폴백 지도) 보여 줄 것이 없으니 지나간다.
    case 'event':
      return node.sceneId
        ? { ...at, phase: { kind: 'story', node: nodeId } }
        : backToMap({
            ...at,
            run: { ...run, log: [...run.log, `${nodeLabel(nodeId, session.map.act)} — 지나갔다.`] },
          });
    case 'start':
    default:
      return backToMap({
        ...at,
        run: { ...run, log: [...run.log, `${nodeLabel(nodeId, session.map.act)} — 지나갔다.`] },
      });
  }
}

/**
 * 씬에 들어설 때의 효과를 회차에 얹는다 (#432).
 *
 * `Scene.onEnter` 의 `stigmaDelta`·`hpDelta`·`setFlags` 가 덱빌더의 침식·체력·플래그와
 * 1:1 로 대응한다 — 번역이 필요 없다. 침식은 성흔 규칙을 그대로 통과시켜야 무흔 면제 같은
 * 것이 여기서도 지켜진다.
 */
function applySceneEffect(run: RunState, session: Session, sceneId?: string): RunState {
  if (!sceneId || !session.scenes) return run;
  const scene = session.scenes.find((s) => s.id === sceneId);
  const e = onEnterEffect(scene);
  if (e.stigmaDelta === 0 && e.hpDelta === 0 && Object.keys(e.setFlags).length === 0) return run;

  const erosion = applyErosion(run.erosion, e.stigmaDelta, run.ability);
  const hp = Math.max(0, Math.min(run.maxHp, run.hp + e.hpDelta));
  const bits: string[] = [];
  if (erosion !== run.erosion) bits.push(`침식 ${run.erosion} → ${erosion}`);
  if (hp !== run.hp) bits.push(`체력 ${run.hp} → ${hp}`);

  return {
    ...run,
    erosion,
    hp,
    flags: { ...run.flags, ...e.setFlags },
    log: bits.length > 0 ? [...run.log, `${scene?.title ?? sceneId} — ${bits.join(', ')}.`] : run.log,
  };
}

/** 노드를 마치고 지도로. 보스를 넘었으면 다음 막(3막이면 엔딩). */
function backToMap(session: Session): Session {
  return { ...session, phase: { kind: 'map' } };
}

/**
 * 세력과 손잡는다 — **되돌릴 수 없다.**
 *
 * 고른 순간 나머지 둘의 카드가 보상 풀에서 사라진다([faction.ts]). 엔딩 판정이 이 값을
 * 그대로 읽으므로, 이 한 번이 결말의 한 갈래다.
 */
export function chooseAlly(session: Session, ally: Faction): Session {
  if (session.run.ally !== null) return session;
  return backToMap({
    ...session,
    run: {
      ...session.run,
      ally,
      log: [...session.run.log, `세력과 손잡았다 — ${ally}. 나머지 둘의 길은 닫혔다.`],
    },
  });
}

/** 이야기를 다 읽고 지도로. 효과는 들어설 때 이미 얹혔다([applySceneEffect]). */
export function leaveStory(session: Session): Session {
  return backToMap(session);
}

/** 지금 노드의 씬 — 화면이 본문을 그릴 때 쓴다. */
export function sceneAt(session: Session, nodeId: string): ScenarioScene | undefined {
  const sceneId = session.map.nodes.find((n) => n.id === nodeId)?.sceneId;
  return sceneId && session.scenes ? session.scenes.find((s) => s.id === sceneId) : undefined;
}

/** 다음 막으로. 3막을 넘었으면 회차가 끝난다. */
function nextAct(session: Session): Session {
  const act = (session.run.act + 1) as Act;
  if (act > 3) return finish(session, 'cleared');
  const next = mapFor(act, session.run.seed, session.scenes);
  // 막 사이에 회복은 없다. 한때 "3막이 완주 불가" 로 보여 쉼을 넣었는데, 실제로는 시험의
  // 자동 플레이어가 침식 카드를 무조건 내던 탓이었다(사람처럼 아끼게 하니 침식 72~87 로
  // 완주했다). 회복을 주면 침식이 안 무서워지고, 그러면 이 게임의 시계가 멈춘다.
  return {
    ...session,
    run: {
      ...session.run,
      act,
      nodeId: next.nodes[0].id,
      log: [...session.run.log, `${act}막으로 들어선다.`],
    },
    map: next,
    phase: { kind: 'map' },
  };
}

/** 이번 노드의 적. 보스는 정제한 만큼 커져 있다. */
export function enemyFor(session: Session, nodeId: string) {
  const node = session.map.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  if (node.kind === 'boss') return bossFor(session.run.act);
  if (node.kind !== 'battle' && node.kind !== 'elite') return null;
  // 정예는 같은 막의 적 중 뒤쪽(센 것)을 쓴다.
  const pool = actEnemies(session.run.act);
  const rng = seeded(session.run.seed + hash(nodeId));
  const i = node.kind === 'elite' ? pool.length - 1 : Math.floor(rng() * pool.length);
  return pool[Math.min(pool.length - 1, i)];
}

/** 노드 id 를 수로 — 같은 노드는 늘 같은 적이 나오게. */
function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100003;
  return h;
}

export function isBossNode(session: Session, nodeId: string): boolean {
  return session.map.nodes.find((n) => n.id === nodeId)?.kind === 'boss';
}

/** 노드 이름 — 막마다 다르다. 회차 경로로 남고 깊은 공유 시 scenePath 가 된다. */
export function nodeLabel(nodeId: string, act: Act): string {
  return `${act}막 ${NODE_LABELS[act - 1] ?? '길'} ${nodeId}`;
}

/** 보스에 얹히는 체력 — 판 결정이 키운 도시. 3막 보스에서만 무겁다. */
export function bonusHpFor(session: Session, nodeId: string): number {
  return isBossNode(session, nodeId) && session.run.act === 3
    ? bossHpBonus(session.run.cityPower)
    : 0;
}

/**
 * 보상으로 내밀 카드 3장.
 *
 * **동맹이 풀을 줄인다** — 고른 뒤에는 중립과 그 세력 카드만 나온다([faction.ts]).
 */
export function offerCards(
  ability: Ability,
  ally: Faction | null,
  rng: () => number = Math.random,
): Card[] {
  // 무흔은 성흔 카드를 못 산다 — 마력을 거절한 자라서.
  const byAlly = allowedCards(ally, POOL);
  const pool = ability === 'none' ? byAlly.filter((c) => c.kind !== 'stigma') : byAlly;
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
  nodeId: string,
  result: { hp: number; erosion: number; deck: Card[]; outcome: 'win' | 'lose' | 'petrified' },
  rng: () => number = Math.random,
): Session {
  const madeNow = countCrystals(result.deck) - countCrystals(session.run.deck);
  const label = nodeLabel(nodeId, session.run.act);
  const run: RunState = {
    ...session.run,
    hp: result.hp,
    erosion: result.erosion,
    deck: result.deck,
    path: [...session.run.path, label],
    log: [...session.run.log, `${label} — ${outcomeWord(result.outcome)}.`],
  };
  const crystalsEverMade = session.crystalsEverMade + Math.max(0, madeNow);
  const at = { ...session, run, crystalsEverMade };

  if (result.outcome !== 'win') return finish(at, result.outcome);
  return { ...at, phase: { kind: 'reward', node: nodeId, offers: offerCards(run.ability, run.ally, rng) } };
}

function outcomeWord(o: 'win' | 'lose' | 'petrified'): string {
  if (o === 'win') return '이겼다';
  if (o === 'petrified') return '굳었다';
  return '쓰러졌다';
}

/** 보상 카드를 고르거나 건너뛴다. 보스를 막 넘었으면 다음 막으로. */
export function takeReward(session: Session, nodeId: string, card: Card | null): Session {
  const run: RunState = card
    ? {
        ...session.run,
        deck: [...session.run.deck, card],
        log: [...session.run.log, `${card.name} 을(를) 가져갔다.`],
      }
    : { ...session.run, log: [...session.run.log, '아무것도 가져가지 않았다.'] };
  const at = { ...session, run };
  return isBossNode(session, nodeId) ? nextAct(at) : backToMap(at);
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

/** 지금 에테르로 지울 수 있는 카드들 — 결정은 태우는 것이 원래 길이라 뺀다. */
export function removable(session: Session): Card[] {
  if (session.run.ether < ETHER_PER_REMOVAL) return [];
  return session.run.deck.filter((c) => c.kind !== 'crystal');
}

/**
 * 에테르로 카드 하나를 지운다 (#439).
 *
 * 전투마다 카드가 하나씩 붙어 덱이 8장에서 14~18장까지 불어난다. 덱은 순환이라 두꺼워질수록
 * 원하는 카드가 늦게 오므로, **더하기만 있고 빼기가 없으면 회차 후반이 묽어진다.**
 * 결정은 이 길로 못 지운다 — 태우는 것이 원래 길이고, 두 길을 다 열면 순환이 된다.
 */
export function removeCard(session: Session, cardId: string): Session {
  if (session.run.ether < ETHER_PER_REMOVAL) return session;
  const card = session.run.deck.find((c) => c.id === cardId);
  if (!card || card.kind === 'crystal') return session;

  let dropped = false;
  const deck = session.run.deck.filter((c) => {
    if (!dropped && c.id === cardId) {
      dropped = true;
      return false;
    }
    return true;
  });
  if (!dropped) return session;

  return {
    ...session,
    run: {
      ...session.run,
      deck,
      ether: session.run.ether - ETHER_PER_REMOVAL,
      log: [...session.run.log, `${card.name} 을(를) 덱에서 지웠다.`],
    },
  };
}

/** 정제소를 떠난다 — 지도로 돌아간다. */
export function leaveRefinery(session: Session, nodeId: string): Session {
  return backToMap({
    ...session,
    run: { ...session.run, path: [...session.run.path, nodeLabel(nodeId, session.run.act)] },
  });
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
    ally: session.run.ally,
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

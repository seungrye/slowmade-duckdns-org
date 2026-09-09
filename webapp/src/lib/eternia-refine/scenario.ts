// 시나리오 트리를 지도로 (#432) — 이야기가 곧 길이다.
//
// #430 의 지도는 추상 생성이었다. 전투·정제소라는 **역할만** 있고 이야기가 없어서, 사건
// 노드는 그냥 지나갔다. 그런데 〈에테르니아의 추락〉에는 이미 씬이 135개 있고 세계관이
// 같다. 그래서 추상 노드에 이야기를 붙이는 대신 **이야기를 지도로 삼는다.**
//
// ── 왜 잘리는가 (실측) ──────────────────────────────────────────────
//
// 씬 그래프는 이미 지도 모양이다. 깊이 3 기준으로 `omphalos_station` 이 20노드(3/6/10),
// `station_knowledge_branch` 가 16(3/8/4)로 뻗고, 6노드 이상 뻗는 씬이 78개다.
// 게다가 표본에서 **층을 건너뛰는 간선이 0**이었다 — 뒤로 가는 것(37개)만 버리면 층이
// 깨끗하게 진다.
//
// ── 지키는 것 ───────────────────────────────────────────────────────
//
// - **전진 간선만 남긴다.** 뒤로·옆으로 가는 길을 두면 지도가 얽혀 읽을 수 없고, 층
//   구조를 전제하는 렌더러도 깨진다. 버린 길은 이야기의 우회로일 뿐 진행에 필요 없다.
// - **모든 노드가 뿌리에서 닿는다.** BFS 로 층을 매기므로 구조적으로 보장된다.
// - **씬이 없으면 이 모듈은 아무것도 못 한다.** 부르는 쪽이 절차 생성 지도로 물러선다
//   (`map.ts`) — 이야기는 없어도 회차는 끝까지 가야 한다.

import type { ActMap } from './map';
import type { Act, MapNode, NodeKind } from './types';
import { pick, seeded, type Rng } from './rng';

/** 이 모듈이 씬에서 실제로 쓰는 것만. 전체 `Scene` 타입에 매이지 않는다. */
export interface ScenarioScene {
  id: string;
  title: string;
  body?: string[];
  isEnding?: boolean;
  choices?: { kind: string; to?: string; label?: string }[];
  onEnter?: {
    stigmaDelta?: number;
    hpDelta?: number;
    setFlags?: Record<string, boolean>;
  };
}

/** 지도로 쓸 깊이. 3 이면 4층(뿌리 포함)이 된다 — 막 하나로 알맞다. */
const DEPTH = 3;

/** 뿌리로 쓸 만한 최소 크기. 너무 얕으면 갈래가 없어 지도가 아니다. */
const MIN_NODES = 5;

/**
 * 씬 제목에서 **저작용 번호를 벗긴다** (#443).
 *
 * 〈에테르니아의 추락〉의 제목은 `Scene 05a — 광장의 소문` 처럼 앞에 씬 번호를 달고 있다.
 * CYOA 를 쓰는 사람에게는 필요한 표지이지만 덱빌더 지도에서는 **플레이어에게 보이는 내부
 * ID** 다. 게다가 지도 라벨은 14자에서 자르므로 번호가 제목을 통째로 밀어낸다 —
 * 실측에서 `Scene 05a — 광...` 이 되어 어디로 가는 길인지 알 수 없었다.
 *
 * 표시하는 자리마다 벗기지 않고 **여기 한 곳에서** 벗긴다. 지도·이야기·저장본이 모두
 * 같은 제목을 쓰게 된다.
 *
 * 번호가 없는 제목은 그대로 둔다 — 벗길 것이 없으면 아무 일도 안 한다.
 */
export function displayTitle(title: string): string {
  return title.replace(/^\s*Scene\s+[\w-]+\s*(?:[—–-]\s*)?/i, '').trim() || title;
}

/** 스탯을 요구하는 `probability` 는 덱빌더에 대응물이 없다 — 전진 길만 쓴다. */
function forwardTargets(s: ScenarioScene): string[] {
  return (s.choices ?? [])
    .filter((c) => c.kind === 'plain' || c.kind === 'conditional')
    .map((c) => c.to)
    .filter((t): t is string => typeof t === 'string');
}

/**
 * 뿌리에서 뻗은 부분그래프를 층 있는 지도로 자른다.
 *
 * BFS 로 층을 매기고 **깊이가 정확히 +1 인 간선만** 남긴다. 그래서 결과는 늘 층 구조이고,
 * 렌더러가 인접 층만 그리면 된다.
 *
 * ```
 * sliceScenario(scenes, 'omphalos_station')  -> 20노드, 층 3/6/10
 * ```
 */
export function sliceScenario(
  scenes: readonly ScenarioScene[],
  rootId: string,
): { nodes: MapNode[]; depth: Record<string, number> } | null {
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const root = byId.get(rootId);
  if (!root) return null;

  const depth: Record<string, number> = { [rootId]: 0 };
  let frontier = [rootId];
  for (let d = 0; d < DEPTH; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      const s = byId.get(id);
      if (!s) continue;
      for (const t of forwardTargets(s)) {
        const target = byId.get(t);
        if (!target || target.isEnding) continue; // 엔딩은 막의 끝이 아니라 회차의 끝이다
        if (depth[t] !== undefined) continue;
        depth[t] = d + 1;
        next.push(t);
      }
    }
    frontier = next;
    if (next.length === 0) break;
  }

  const ids = Object.keys(depth);
  if (ids.length < MIN_NODES) return null;

  // 층별로 칸을 매긴다. 화면이 이 값으로 자리를 잡는다.
  const perRow = new Map<number, number>();
  const nodes: MapNode[] = ids.map((id) => {
    const row = depth[id];
    const col = perRow.get(row) ?? 0;
    perRow.set(row, col + 1);
    const s = byId.get(id)!;
    return {
      id,
      row,
      col,
      kind: 'battle', // 역할은 [assignRoles] 가 덧씌운다
      next: [],
      sceneId: id,
      title: displayTitle(s.title),
    };
  });

  // **전진 간선만.** 뒤로·옆으로 가는 길은 버린다.
  const node = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    const s = byId.get(n.id)!;
    n.next = forwardTargets(s).filter((t) => node.has(t) && depth[t] === n.row + 1);
  }

  return { nodes, depth };
}

/**
 * 노드에 역할을 덧씌운다 — 노드는 **씬이면서 동시에 조우**다.
 *
 * 마지막 층은 보스, 2막 합류점은 동맹, 정제소는 막마다 최소 하나(#430 규칙 그대로).
 * 그래서 「Scene 07 — 가솔린 열차」가 곧 그 전투의 무대가 된다.
 */
export function assignRoles(nodes: MapNode[], act: Act, rng: Rng): void {
  const maxRow = Math.max(...nodes.map((n) => n.row));
  const middle = nodes.filter((n) => n.row > 0 && n.row < maxRow);

  for (const n of nodes) {
    if (n.row === 0) n.kind = 'start';
    else if (n.row === maxRow) n.kind = 'boss';
    else n.kind = rng() < 0.25 ? ('event' as NodeKind) : ('battle' as NodeKind);
  }

  // 결정을 뺄 자리는 막마다 반드시 있어야 한다 — 없으면 덱이 굳는다.
  if (middle.length > 0 && !nodes.some((n) => n.kind === 'refinery')) {
    middle[pick(rng, middle.length)].kind = 'refinery';
  }
  // 2막에서 한 번, 세력과 손잡는다.
  if (act === 2 && middle.length > 0) {
    const spot = middle.find((n) => n.kind !== 'refinery') ?? middle[0];
    spot.kind = 'alliance';
  }
}

/** 지도로 쓸 만한 뿌리들 — 갈래가 충분히 뻗는 씬만. */
export function rootCandidates(scenes: readonly ScenarioScene[]): string[] {
  return scenes
    .filter((s) => !s.isEnding && sliceScenario(scenes, s.id) !== null)
    .map((s) => s.id);
}

/**
 * 막의 지도를 시나리오에서 만든다. 못 만들면 **null** — 부르는 쪽이 절차 생성으로 물러선다.
 *
 * 뿌리를 씨앗으로 고르므로 같은 씨앗이면 같은 이야기다(#430 의 재현성을 그대로 잇는다).
 */
export function scenarioMap(
  scenes: readonly ScenarioScene[],
  act: Act,
  seed: number,
): ActMap | null {
  const roots = rootCandidates(scenes);
  if (roots.length === 0) return null;

  const rng = seeded(seed + act * 7919);
  const rootId = roots[pick(rng, roots.length)];
  const sliced = sliceScenario(scenes, rootId);
  if (!sliced) return null;

  assignRoles(sliced.nodes, act, rng);
  return { act, seed, nodes: sliced.nodes };
}

/** 씬에 들어설 때의 효과 — 덱빌더의 침식·체력·플래그에 그대로 얹힌다. */
export function onEnterEffect(scene: ScenarioScene | undefined) {
  return {
    stigmaDelta: scene?.onEnter?.stigmaDelta ?? 0,
    hpDelta: scene?.onEnter?.hpDelta ?? 0,
    setFlags: scene?.onEnter?.setFlags ?? {},
  };
}

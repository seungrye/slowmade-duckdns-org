// 막의 지도 (#430) — 씨앗 하나에서 분기 그래프가 나온다.
//
// 목업(Map.dc.html)의 모양을 따른다: 시작 하나 → 갈라졌다가 → 가운데서 한 번 합류 →
// 다시 갈라졌다가 → 보스 하나로 합류. 그 합류 지점이 2막에서는 **세력 동맹 자리**다.
//
// ── 왜 절차 생성인가 ────────────────────────────────────────────────
//
// 손으로 짜면 연출은 잡히지만 회차마다 같다. 덱빌더에서 다시 할 이유는 대개 "이번엔 다른
// 길"에서 나오므로 지도는 매번 달라야 한다. 대신 **씨앗을 고정하면 같은 지도**라, 실패한
// 회차를 그대로 다시 걸을 수 있고 시험도 성립한다([rng.ts]).
//
// ── 지키는 것 ───────────────────────────────────────────────────────
//
// - **보스까지 가는 길이 반드시 있다.** 층을 하나씩 이어 붙이며 만들고, 각 노드가 다음 층
//   최소 하나와 이어지게 강제한다. 나중에 "길이 끊긴 지도" 를 만나면 회차가 통째로 막힌다.
// - **막마다 정제소가 최소 하나.** 결정을 뺄 유일한 자리라, 없으면 덱이 굳어 버린다.
// - **인접 층끼리만 잇는다.** 층을 건너뛰면 화면에서 선이 교차해 읽을 수 없다.

import type { Act, MapNode, NodeKind } from './types';
import { pick, seeded, type Rng } from './rng';

/** 층 수 — 시작·보스를 포함한다. 목업의 6층(시작·2·4·합류·3·보스)을 따른다. */
const ROWS = 6;

/** 합류 층 — 여기 하나로 모인다. 2막이면 이 자리에서 동맹을 고른다. */
export const JOIN_ROW = 3;

/** 층별 노드 수. 시작·합류·보스는 하나. */
const WIDTHS = [1, 2, 4, 1, 3, 1] as const;

/** 뽑기 상자 — 뒤로 갈수록 험해진다. 보스·정제소·합류는 따로 놓으므로 여기 없다. */
const KINDS_EARLY: NodeKind[] = ['battle', 'battle', 'event', 'refinery'];
const KINDS_LATE: NodeKind[] = ['battle', 'elite', 'event', 'refinery'];

export interface ActMap {
  act: Act;
  seed: number;
  nodes: MapNode[];
}

/** `row`·`col` 로 id 를 만든다 — 저장·복원이 문자열 하나로 끝난다. */
export function nodeId(row: number, col: number): string {
  return `${row}-${col}`;
}

/**
 * 막의 지도를 만든다. **같은 씨앗이면 같은 지도**다.
 *
 * ```
 * makeMap(1, 42).nodes.length === makeMap(1, 42).nodes.length   // 늘 같다
 * ```
 */
export function makeMap(act: Act, seed: number): ActMap {
  const rng = seeded(seed + act * 7919);
  const nodes: MapNode[] = [];

  for (let row = 0; row < ROWS; row++) {
    const width = WIDTHS[row];
    for (let col = 0; col < width; col++) {
      nodes.push({
        id: nodeId(row, col),
        row,
        col,
        kind: kindFor(act, row, col, rng),
        next: [],
      });
    }
  }

  connect(nodes, rng);
  ensureRefinery(nodes, act, rng);
  return { act, seed, nodes };
}

function kindFor(act: Act, row: number, col: number, rng: Rng): NodeKind {
  if (row === 0) return 'start';
  if (row === ROWS - 1) return 'boss';
  // 합류 층은 막마다 뜻이 다르다 — 2막이면 여기서 세력과 손잡는다.
  if (row === JOIN_ROW) return act === 2 ? 'alliance' : 'refinery';
  const box = row <= 2 ? KINDS_EARLY : KINDS_LATE;
  return box[pick(rng, box.length)];
}

/**
 * 인접 층끼리 잇는다.
 *
 * 각 노드는 다음 층에서 **자기 자리에 가까운 것 하나 이상**과 이어진다. 먼저 그 하나를
 * 보장한 뒤 이웃을 더 이어 갈래를 만든다 — 순서를 뒤집으면 아무와도 안 이어진 노드가 남는다.
 */
function connect(nodes: MapNode[], rng: Rng): void {
  const byRow = (r: number) => nodes.filter((n) => n.row === r);

  for (let row = 0; row < ROWS - 1; row++) {
    const here = byRow(row);
    const next = byRow(row + 1);

    here.forEach((n, i) => {
      // 자기 자리 비율을 다음 층에 옮겨 가장 가까운 노드를 고른다.
      const anchor = here.length === 1 ? 0 : Math.round((i / (here.length - 1)) * (next.length - 1));
      n.next.push(next[anchor].id);
      // 이웃 하나를 더 이어 갈래를 만든다. 합류 층으로 들어갈 때는 어차피 하나뿐이다.
      const side = anchor + (rng() < 0.5 ? -1 : 1);
      if (next[side] && !n.next.includes(next[side].id)) n.next.push(next[side].id);
    });

    // 아무도 안 가리키는 노드가 남으면 길이 끊긴다 — 가장 가까운 앞 노드에 붙인다.
    next.forEach((t, j) => {
      if (here.some((n) => n.next.includes(t.id))) return;
      const anchor = next.length === 1 ? 0 : Math.round((j / (next.length - 1)) * (here.length - 1));
      here[anchor].next.push(t.id);
    });
  }
}

/** 막마다 정제소가 최소 하나 — 결정을 뺄 유일한 자리다. */
function ensureRefinery(nodes: MapNode[], act: Act, rng: Rng): void {
  if (nodes.some((n) => n.kind === 'refinery')) return;
  // 합류·시작·보스가 아닌 자리 중 하나를 정제소로 바꾼다.
  const spots = nodes.filter((n) => n.row > 0 && n.row < ROWS - 1 && n.row !== JOIN_ROW);
  const target = spots[pick(rng, spots.length)];
  if (target) target.kind = 'refinery';
  else if (act === 2) return; // 2막 합류는 동맹이라 건드리지 않는다
}

/** 지금 자리에서 갈 수 있는 노드들. 시작 전(null)이면 첫 층. */
export function reachable(map: ActMap, from: string | null): MapNode[] {
  if (from === null) return map.nodes.filter((n) => n.row === 0);
  const here = map.nodes.find((n) => n.id === from);
  if (!here) return [];
  return here.next
    .map((id) => map.nodes.find((n) => n.id === id))
    .filter((n): n is MapNode => n !== undefined);
}

/** 보스 노드. 지도마다 하나다. */
export function bossOf(map: ActMap): MapNode {
  return map.nodes[map.nodes.length - 1];
}

/** 보스까지 가는 길이 있나 — 지도가 끊기면 회차가 통째로 막힌다. */
export function bossReachable(map: ActMap): boolean {
  const boss = bossOf(map).id;
  const seen = new Set<string>();
  const stack = map.nodes.filter((n) => n.row === 0).map((n) => n.id);
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === boss) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = map.nodes.find((x) => x.id === id);
    n?.next.forEach((x) => stack.push(x));
  }
  return false;
}

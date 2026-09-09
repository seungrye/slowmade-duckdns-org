// 지도 (#430) — 회차마다 달라야 하지만, 깨져 있으면 안 된다.
//
// 여기서 지키는 것은 재미가 아니라 **회차가 막히지 않는 것**이다. 길이 끊긴 지도나
// 정제소 없는 막이 한 번이라도 나오면 그 회차는 통째로 못 끝낸다. 절차 생성이라
// 눈으로 다 볼 수 없으므로 씨앗을 많이 돌려 못 박는다.

import { describe, it, expect } from 'vitest';
import { makeMap, reachable, bossOf, bossReachable, JOIN_ROW } from './map';
import type { Act } from './types';

const ACTS: Act[] = [1, 2, 3];
/** 눈으로 못 보는 것을 대신 본다 — 씨앗을 넓게 훑는다. */
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 977 + 3);

describe('같은 씨앗이면 같은 지도', () => {
  it('두 번 만들어도 노드·연결이 같다', () => {
    expect(makeMap(2, 42)).toEqual(makeMap(2, 42));
  });

  it('씨앗이 다르면 대개 다르다 — 안 그러면 다시 할 이유가 없다', () => {
    const shapes = SEEDS.slice(0, 20).map((s) => JSON.stringify(makeMap(1, s).nodes.map((n) => n.kind)));
    expect(new Set(shapes).size).toBeGreaterThan(1);
  });

  it('막이 다르면 지도도 다르다 — 같은 씨앗이라도', () => {
    expect(makeMap(1, 42).nodes.map((n) => n.kind)).not.toEqual(makeMap(3, 42).nodes.map((n) => n.kind));
  });
});

describe('회차가 막히지 않는다', () => {
  it('어느 씨앗·막에서도 보스까지 가는 길이 있다', () => {
    for (const act of ACTS) {
      for (const seed of SEEDS) {
        expect(bossReachable(makeMap(act, seed)), `act${act} seed${seed}`).toBe(true);
      }
    }
  });

  it('막마다 정제소가 최소 하나 — 결정을 뺄 유일한 자리다', () => {
    for (const act of ACTS) {
      for (const seed of SEEDS) {
        const m = makeMap(act, seed);
        const has = m.nodes.some((n) => n.kind === 'refinery');
        expect(has, `act${act} seed${seed}`).toBe(true);
      }
    }
  });

  it('첫 층에서 시작할 수 있다', () => {
    const m = makeMap(1, 7);
    expect(reachable(m, null).length).toBeGreaterThan(0);
  });
});

describe('연결', () => {
  it('인접 층끼리만 잇는다 — 건너뛰면 화면에서 선이 꼬인다', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const m = makeMap(2, seed);
      for (const n of m.nodes) {
        for (const id of n.next) {
          const t = m.nodes.find((x) => x.id === id)!;
          expect(t.row, `${n.id}→${id}`).toBe(n.row + 1);
        }
      }
    }
  });

  it('아무도 안 가리키는 노드가 없다 — 갈 수 없는 자리는 없는 자리다', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const m = makeMap(3, seed);
      const pointed = new Set(m.nodes.flatMap((n) => n.next));
      for (const n of m.nodes) {
        if (n.row === 0) continue;
        expect(pointed.has(n.id), `seed${seed} ${n.id}`).toBe(true);
      }
    }
  });

  it('보스는 마지막 하나뿐이다', () => {
    const m = makeMap(1, 11);
    expect(m.nodes.filter((n) => n.kind === 'boss')).toHaveLength(1);
    expect(bossOf(m).kind).toBe('boss');
  });
});

describe('합류 층', () => {
  it('2막의 합류 자리는 세력 동맹이다', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const join = makeMap(2, seed).nodes.filter((n) => n.row === JOIN_ROW);
      expect(join).toHaveLength(1);
      expect(join[0].kind).toBe('alliance');
    }
  });

  it('1·3막에는 동맹 자리가 없다 — 한 번만 고른다', () => {
    for (const act of [1, 3] as Act[]) {
      for (const seed of SEEDS.slice(0, 10)) {
        expect(makeMap(act, seed).nodes.some((n) => n.kind === 'alliance')).toBe(false);
      }
    }
  });

  it('모든 길이 합류 층 하나를 지난다', () => {
    const m = makeMap(2, 5);
    const before = m.nodes.filter((n) => n.row === JOIN_ROW - 1);
    const join = m.nodes.find((n) => n.row === JOIN_ROW)!;
    for (const n of before) expect(n.next).toContain(join.id);
  });
});

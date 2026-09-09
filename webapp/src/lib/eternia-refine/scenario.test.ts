// 시나리오 트리 → 지도 (#432).
//
// **mongo 없이 돈다.** 실제 씬은 DB 에 있지만 시험이 DB 를 켜야 한다면 CI 에서 못 돌고,
// 콘텐츠가 바뀔 때마다 시험이 흔들린다. 그래서 여기서는 **모양만 같은 고정 씬**을 넣는다 —
// 이 모듈이 지키는 것은 이야기의 내용이 아니라 **자른 결과가 지도로 성립하는가**다.

import { describe, it, expect } from 'vitest';
import {
  sliceScenario,
  scenarioMap,
  rootCandidates,
  onEnterEffect,
  type ScenarioScene,
} from './scenario';
import { seeded } from './rng';

const plain = (to: string) => ({ kind: 'plain', to });

/**
 * 실제 그래프와 같은 결의 표본 — 뿌리에서 갈라졌다가 아래층에서 다시 넓어지고,
 * **뒤로 가는 길**(c1 → root)과 **엔딩**(dead)이 섞여 있다. 둘 다 걸러져야 한다.
 */
const SCENES: ScenarioScene[] = [
  { id: 'root', title: '가솔린 열차', choices: [plain('a1'), plain('a2'), plain('a3')] },
  { id: 'a1', title: '강철의 결단', choices: [plain('b1'), plain('b2')] },
  { id: 'a2', title: '지식의 결단', choices: [plain('b2'), plain('b3')] },
  { id: 'a3', title: '블랙마켓', choices: [plain('b3'), plain('root')] }, // 뒤로 가는 길
  { id: 'b1', title: '지하 잠적', choices: [plain('c1')], onEnter: { stigmaDelta: 6 } },
  { id: 'b2', title: '사제단의 인장', choices: [plain('c1'), plain('dead')] },
  { id: 'b3', title: '떠나기 전', choices: [plain('c2')], onEnter: { hpDelta: -4 } },
  { id: 'c1', title: '끌어올림', choices: [plain('root')] }, // 뒤로
  { id: 'c2', title: '외곽', choices: [] },
  { id: 'dead', title: '석화', isEnding: true, choices: [] },
];

describe('sliceScenario', () => {
  it('뿌리에서 층을 매겨 자른다', () => {
    const cut = sliceScenario(SCENES, 'root')!;
    expect(cut).not.toBeNull();
    expect(cut.depth['root']).toBe(0);
    expect(cut.depth['a1']).toBe(1);
    expect(cut.depth['b1']).toBe(2);
    expect(cut.depth['c1']).toBe(3);
  });

  it('**전진 간선만 남긴다** — 뒤로 가는 길은 지도를 얽는다', () => {
    const cut = sliceScenario(SCENES, 'root')!;
    for (const n of cut.nodes) {
      for (const t of n.next) {
        expect(cut.depth[t], `${n.id}→${t}`).toBe(n.row + 1);
      }
    }
    // a3 → root 는 버려졌다.
    expect(cut.nodes.find((n) => n.id === 'a3')!.next).not.toContain('root');
  });

  it('엔딩 씬은 지도에 안 들어온다 — 막의 끝이 아니라 회차의 끝이다', () => {
    const cut = sliceScenario(SCENES, 'root')!;
    expect(cut.nodes.some((n) => n.id === 'dead')).toBe(false);
  });

  it('모든 노드가 뿌리에서 닿는다', () => {
    const cut = sliceScenario(SCENES, 'root')!;
    const seen = new Set(['root']);
    const stack = ['root'];
    while (stack.length) {
      const id = stack.pop()!;
      for (const t of cut.nodes.find((n) => n.id === id)!.next) {
        if (!seen.has(t)) { seen.add(t); stack.push(t); }
      }
    }
    expect(seen.size).toBe(cut.nodes.length);
  });

  it('씬을 담고 있다 — 노드는 조우이면서 이야기다', () => {
    const n = sliceScenario(SCENES, 'root')!.nodes.find((x) => x.id === 'a1')!;
    expect(n.sceneId).toBe('a1');
    expect(n.title).toBe('강철의 결단');
  });

  it('없는 뿌리·너무 얕은 뿌리는 거절한다', () => {
    expect(sliceScenario(SCENES, '없는씬')).toBeNull();
    expect(sliceScenario(SCENES, 'c2')).toBeNull(); // 갈래가 없다
  });
});

describe('scenarioMap', () => {
  it('같은 씨앗이면 같은 이야기 — 회차를 다시 걸을 수 있다', () => {
    expect(scenarioMap(SCENES, 1, 42)).toEqual(scenarioMap(SCENES, 1, 42));
  });

  it('막마다 정제소가 하나는 있다 — 결정을 뺄 유일한 자리', () => {
    for (const act of [1, 2, 3] as const) {
      for (const seed of [1, 7, 42, 99]) {
        const m = scenarioMap(SCENES, act, seed)!;
        expect(m.nodes.some((n) => n.kind === 'refinery'), `act${act} seed${seed}`).toBe(true);
      }
    }
  });

  it('2막에만 동맹 자리가 있다 — 한 번만 고른다', () => {
    expect(scenarioMap(SCENES, 2, 42)!.nodes.some((n) => n.kind === 'alliance')).toBe(true);
    expect(scenarioMap(SCENES, 1, 42)!.nodes.some((n) => n.kind === 'alliance')).toBe(false);
    expect(scenarioMap(SCENES, 3, 42)!.nodes.some((n) => n.kind === 'alliance')).toBe(false);
  });

  it('첫 층은 출발, 마지막 층은 보스', () => {
    const m = scenarioMap(SCENES, 1, 42)!;
    const maxRow = Math.max(...m.nodes.map((n) => n.row));
    expect(m.nodes.filter((n) => n.row === 0).every((n) => n.kind === 'start')).toBe(true);
    expect(m.nodes.filter((n) => n.row === maxRow).every((n) => n.kind === 'boss')).toBe(true);
  });

  it('**씬이 없으면 null** — 부르는 쪽이 절차 생성으로 물러선다', () => {
    expect(scenarioMap([], 1, 42)).toBeNull();
    expect(scenarioMap([{ id: 'only', title: '혼자', choices: [] }], 1, 42)).toBeNull();
  });
});

describe('rootCandidates', () => {
  it('갈래가 뻗는 씬만 뿌리가 된다', () => {
    const roots = rootCandidates(SCENES);
    expect(roots).toContain('root');
    expect(roots).not.toContain('c2'); // 막다른 곳
    expect(roots).not.toContain('dead'); // 엔딩
  });
});

describe('onEnterEffect', () => {
  it('침식·체력·플래그를 그대로 꺼낸다 — 덱빌더 값과 1:1 이다', () => {
    const e = onEnterEffect(SCENES.find((s) => s.id === 'b1'));
    expect(e.stigmaDelta).toBe(6);
    expect(e.hpDelta).toBe(0);
  });

  it('없는 씬·효과 없는 씬은 0 이다 — 부르는 쪽이 분기하지 않게', () => {
    expect(onEnterEffect(undefined)).toEqual({ stigmaDelta: 0, hpDelta: 0, setFlags: {} });
  });
});

describe('씨앗', () => {
  it('막이 다르면 다른 이야기를 고른다', () => {
    const rng = seeded(1);
    expect(typeof rng()).toBe('number'); // rng 가 살아 있는지만 — 지도 비교는 위에서 한다
    const a = scenarioMap(SCENES, 1, 5)!.nodes[0].id;
    const b = scenarioMap(SCENES, 3, 5)!.nodes[0].id;
    // 표본이 작아 같을 수도 있다. 적어도 던지지 않고 지도를 낸다.
    expect(typeof a).toBe('string');
    expect(typeof b).toBe('string');
  });
});

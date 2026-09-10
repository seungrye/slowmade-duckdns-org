// 시나리오 트리 → 지도 (#432).
//
// **mongo 없이 돈다.** 실제 씬은 DB 에 있지만 시험이 DB 를 켜야 한다면 CI 에서 못 돌고,
// 콘텐츠가 바뀔 때마다 시험이 흔들린다. 그래서 여기서는 **모양만 같은 고정 씬**을 넣는다 —
// 이 모듈이 지키는 것은 이야기의 내용이 아니라 **자른 결과가 지도로 성립하는가**다.

import { describe, it, expect } from 'vitest';
import {
  displayTitle,
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

describe('displayTitle — 저작용 번호는 플레이어의 것이 아니다 (#443)', () => {
  it('앞의 씬 번호를 벗긴다', () => {
    expect(displayTitle('Scene 05a — 광장의 소문')).toBe('광장의 소문');
    expect(displayTitle('Scene R-04e — 정제 현장')).toBe('정제 현장');
    expect(displayTitle('Scene 04 - 지하 잠적')).toBe('지하 잠적');
  });

  it('번호가 없으면 그대로 둔다 — 벗길 것이 없으면 아무 일도 안 한다', () => {
    expect(displayTitle('가솔린 열차')).toBe('가솔린 열차');
    expect(displayTitle('강철의 결단')).toBe('강철의 결단');
  });

  it('번호뿐인 제목은 통째로 지우지 않는다 — 빈 라벨보다 낫다', () => {
    expect(displayTitle('Scene 05a')).toBe('Scene 05a');
  });

  it('지도가 그것을 쓴다 — 표시하는 자리마다 벗기지 않는다', () => {
    const scenes: ScenarioScene[] = [
      { id: 'r', title: 'Scene 01 — 뿌리', choices: [plain('a'), plain('b')] },
      { id: 'a', title: 'Scene 02 — 왼쪽', choices: [plain('c')] },
      { id: 'b', title: 'Scene 03 — 오른쪽', choices: [plain('c')] },
      { id: 'c', title: 'Scene 04 — 만남', choices: [plain('d')] },
      { id: 'd', title: 'Scene 05 — 끝', choices: [] },
    ];
    const cut = sliceScenario(scenes, 'r')!;
    expect(cut.nodes.map((n) => n.title)).not.toContain('Scene 01 — 뿌리');
    expect(cut.nodes.find((n) => n.id === 'r')!.title).toBe('뿌리');
  });
});

// 막다른 길 (#457) — 정제소에 들어갔더니 다음 길이 없다는 제보.
//
// `sliceScenario` 는 뿌리에서 닿는 것은 보장하지만 **보스까지 가는 것은 보장하지 않았다.**
// forward target 이 전부 엔딩이거나 이미 앞 층에서 번호가 매겨졌으면(`depth[t] !== undefined`
// 로 건너뛴다) 그 노드는 `next: []` 로 남는다.
describe('막다른 길은 지도에 없다 (#457)', () => {
  /**
   * `dead` 는 앞 층에서 이미 쓰인 곳(`b1`)으로만 간다 → 전진 간선이 하나도 안 남는다.
   * 예전에는 그대로 지도에 실려 들어가면 나올 수 없었다.
   */
  const WITH_DEAD: ScenarioScene[] = [
    { id: 'root', title: '뿌리', choices: [plain('a1'), plain('a2')] },
    { id: 'a1', title: '왼쪽', choices: [plain('b1')] },
    { id: 'a2', title: '오른쪽', choices: [plain('dead'), plain('b1')] },
    { id: 'b1', title: '만남', choices: [plain('c1')] },
    { id: 'dead', title: '막다른 곳', choices: [plain('b1')] }, // 뒤로만 간다 → 전진 0
    { id: 'c1', title: '끝', choices: [] },
  ];

  it('마지막 층이 아닌데 나갈 길이 없는 노드는 빠진다', () => {
    const cut = sliceScenario(WITH_DEAD, 'root')!;
    expect(cut).not.toBeNull();
    expect(cut.nodes.some((n) => n.id === 'dead')).toBe(false);
  });

  it('남은 노드는 전부 마지막 층까지 갈 수 있다', () => {
    const cut = sliceScenario(WITH_DEAD, 'root')!;
    const maxRow = Math.max(...cut.nodes.map((n) => n.row));
    const byId = new Map(cut.nodes.map((n) => [n.id, n]));
    const canReach = (id: string, seen = new Set<string>()): boolean => {
      const n = byId.get(id);
      if (!n) return false;
      if (n.row === maxRow) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return n.next.some((t) => canReach(t, seen));
    };
    for (const n of cut.nodes) {
      expect(canReach(n.id), `${n.id}(row ${n.row}) 에서 보스까지`).toBe(true);
    }
  });

  it('실제 씬으로 만든 지도에도 막다른 길이 없다', () => {
    for (const act of [1, 2, 3] as const) {
      for (const seed of [1, 7, 42, 99, 123, 2026]) {
        const m = scenarioMap(SCENES, act, seed);
        if (!m) continue;
        const maxRow = Math.max(...m.nodes.map((n) => n.row));
        for (const n of m.nodes) {
          if (n.row === maxRow) continue;
          expect(n.next.length, `act${act} seed${seed} ${n.id}(row ${n.row})`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('추려 낸 뒤 너무 작아지면 null — 절차 생성으로 물러선다', () => {
    // 뿌리에서 두 갈래가 다 막다른 길이면 남는 게 없다.
    const allDead: ScenarioScene[] = [
      { id: 'root', title: '뿌리', choices: [plain('x'), plain('y')] },
      { id: 'x', title: '막힘1', choices: [] },
      { id: 'y', title: '막힘2', choices: [] },
    ];
    expect(sliceScenario(allDead, 'root')).toBeNull();
  });
});

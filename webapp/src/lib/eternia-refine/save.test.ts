// 저장·이어하기 (#435).
//
// 여기서 지키는 것은 **회차를 잃지 않는 것**과 **저장으로 규칙을 우회하지 못하는 것**이다.
// 전투 중 저장을 허용하면 불리한 턴에서 되감을 수 있고, 저장본을 손으로 고쳐 못 가는
// 노드로 뛸 수 있으면 지도가 뜻을 잃는다.
//
// 순수 부분만 시험한다 — localStorage 를 만지는 얇은 껍데기는 실패를 삼키도록 짜여 있다.

import { describe, it, expect } from 'vitest';
import { toSave, fromSave, isSavable, isValidSave, type SavedRun } from './save';
import { startRun, choices, enterNode, type Session } from './run';
import type { ScenarioScene } from './scenario';

const plain = (to: string) => ({ kind: 'plain', to });
const SCENES: ScenarioScene[] = [
  { id: 'r', title: '가솔린 열차', choices: [plain('a'), plain('b')] },
  { id: 'a', title: '강철', choices: [plain('c')] },
  { id: 'b', title: '지식', choices: [plain('c')] },
  { id: 'c', title: '외곽', choices: [plain('d')] },
  { id: 'd', title: '끝', choices: [] },
];

const run = () => startRun('rin', 'lunar', 42);

describe('isSavable — 전투 중에는 저장하지 않는다', () => {
  it('노드 사이에서는 저장한다', () => {
    expect(isSavable({ kind: 'map' })).toBe(true);
    expect(isSavable({ kind: 'refinery', node: '1-0' })).toBe(true);
    expect(isSavable({ kind: 'alliance', node: '3-0' })).toBe(true);
    expect(isSavable({ kind: 'story', node: '1-0' })).toBe(true);
    expect(isSavable({ kind: 'reward', node: '1-0', offers: [] })).toBe(true);
  });

  it('전투 중에는 안 한다 — 허용하면 불리한 턴에서 되감는 길이 열린다', () => {
    expect(isSavable({ kind: 'battle', node: '1-0' })).toBe(false);
  });

  it('끝난 회차·시작 전은 안 한다', () => {
    expect(isSavable({ kind: 'ending', endingId: 'harmony', why: '' })).toBe(false);
    expect(isSavable({ kind: 'title' })).toBe(false);
    expect(isSavable({ kind: 'select' })).toBe(false);
  });
});

describe('toSave', () => {
  it('다시 만들 수 있는 것은 안 담는다 — 지도·씬은 저장하지 않는다', () => {
    const saved = toSave(run())!;
    expect(saved).not.toBeNull();
    expect(Object.keys(saved).sort()).toEqual(['crystalsEverMade', 'phase', 'run', 'v']);
  });

  it('저장하면 안 되는 화면에서는 null', () => {
    const s: Session = { ...run(), phase: { kind: 'battle', node: '1-0' } };
    expect(toSave(s)).toBeNull();
  });
});

describe('fromSave — 되살리기', () => {
  it('씨앗에서 지도를 다시 만든다. 회차 값은 그대로다', () => {
    const before = run();
    const back = fromSave(toSave(before)!, null);
    expect(back.map).toEqual(before.map);
    expect(back.run.seed).toBe(before.run.seed);
    expect(back.run.erosion).toBe(before.run.erosion);
    expect(back.run.deck.length).toBe(before.run.deck.length);
  });

  it('걷던 자리에서 잇는다', () => {
    const walked = enterNode(run(), choices(run())[0].id);
    const back = fromSave(toSave(walked)!, null);
    expect(back.run.nodeId).toBe(walked.run.nodeId);
  });

  it('지도가 달라졌으면 막의 처음으로 — 회차를 잃는 것보다 한 층 되돌린다', () => {
    // 절차 생성으로 저장해 두고, 되살릴 때는 씬이 있어 지도가 바뀐 상황.
    const saved = toSave(enterNode(run(), choices(run())[0].id))!;
    const back = fromSave(saved, SCENES);
    expect(back.map.nodes.some((n) => n.sceneId)).toBe(true); // 이야기 지도로 바뀌었다
    expect(back.phase.kind).toBe('map');
    expect(back.map.nodes.some((n) => n.id === back.run.nodeId)).toBe(true);
  });

  it('되살린 뒤에도 갈 수 있는 노드로만 간다 — 저장본을 고쳐도 규칙이 막는다', () => {
    const back = fromSave(toSave(run())!, null);
    const far = back.map.nodes.find((n) => n.row === 4)!;
    expect(enterNode(back, far.id)).toBe(back); // 아무 일도 안 일어난다
  });
});

describe('isValidSave — 손으로 고친 것·옛 판을 거른다', () => {
  const good = (): SavedRun => toSave(run())!;

  it('제대로 된 것은 받는다', () => {
    expect(isValidSave(good())).toBe(true);
  });

  it('판이 다르면 거절한다', () => {
    expect(isValidSave({ ...good(), v: 2 })).toBe(false);
  });

  it('모양이 깨졌으면 거절한다', () => {
    expect(isValidSave(null)).toBe(false);
    expect(isValidSave({})).toBe(false);
    expect(isValidSave('저장본')).toBe(false);
    expect(isValidSave({ ...good(), run: { ...good().run, seed: '42' } })).toBe(false);
  });
});

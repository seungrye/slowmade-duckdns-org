// 카드·적·주인공 데이터 (#419).
//
// 세로 슬라이스라 DB 를 쓰지 않는다 — 상수로 둔다. 밸런스를 만지는 곳이 한 곳이어야
// 두 라우트를 같은 조건으로 비교할 수 있다.
//
// 카드 비용·침식량은 **이 게임의 밸런스**라 web-adventure 와 공유하지 않는다. 공유하는
// 것은 세계의 법칙(침식 0~100, 100 이면 석화)뿐이다.

import type { Ability, Card, Enemy, Protagonist } from './types';

/** 성흔 — 침식을 어떻게 읽는가. */
export const ABILITIES: { id: Ability; name: string; reading: string }[] = [
  { id: 'lunar', name: '루나', reading: '침식 25마다 매 턴 드로우 +1' },
  { id: 'selene', name: '셀레네', reading: '피해에 침식 ÷ 10 을 더한다' },
  { id: 'hecate', name: '헤카테', reading: '결정을 방어로 바꾸는 카드가 강해진다' },
  { id: 'none', name: '무흔', reading: '침식이 오르지 않는다 · 성흔 카드를 못 산다' },
];

export interface ProtagonistDef {
  id: Protagonist;
  name: string;
  title: string;
  startErosion: number;
  maxHp: number;
  /** 시작 덱에 섞을 결정 수 — 카엘은 이미 늦었다. */
  startCrystals: number;
  note: string;
}

export const PROTAGONISTS: ProtagonistDef[] = [
  {
    id: 'kael',
    name: '카엘',
    title: '솔라리스 폐기 예정자',
    startErosion: 80,
    maxHp: 44,
    startCrystals: 2,
    note: '시한부. 20 남기고 시작한다.',
  },
  {
    id: 'rin',
    name: '린',
    title: '아이언가드 하급 수사관',
    startErosion: 10,
    maxHp: 50,
    startCrystals: 0,
    note: '기준선. 얼마나 태울지 스스로 고른다.',
  },
  {
    id: 'solwen',
    name: '솔웬',
    title: '네오엘프 옥수',
    startErosion: 0,
    maxHp: 56,
    startCrystals: 0,
    note: '덱이 끝까지 깨끗하다. 대신 돈이 없다.',
  },
];

function card(c: Card): Card {
  return c;
}

/** 시작 덱 — 어느 주인공이든 같다. 차이는 침식과 체력에서 온다. */
export const STARTER: Card[] = [
  card({ id: 's1', name: '메스', text: '피해 7.', kind: 'tool', cost: 1, erosion: 0, damage: 7 }),
  card({ id: 's2', name: '메스', text: '피해 7.', kind: 'tool', cost: 1, erosion: 0, damage: 7 }),
  card({ id: 's3', name: '메스', text: '피해 7.', kind: 'tool', cost: 1, erosion: 0, damage: 7 }),
  card({ id: 's4', name: '웅크린다', text: '방어 6.', kind: 'tool', cost: 1, erosion: 0, block: 6 }),
  card({ id: 's5', name: '웅크린다', text: '방어 6.', kind: 'tool', cost: 1, erosion: 0, block: 6 }),
  card({
    id: 's6', name: '달의 각인', text: '피해 14. 카드 1장을 뽑는다.',
    kind: 'stigma', cost: 1, erosion: 10, damage: 14, draw: 1, affinity: 'lunar',
  }),
  card({
    id: 's7', name: '군용 붕대', text: '체력 8 회복.',
    kind: 'tool', cost: 1, erosion: 0, heal: 8,
  }),
  card({
    id: 's8', name: '현장 정제', text: '결정을 태울 자리를 만든다 — 정제소에서.',
    kind: 'tool', cost: 0, erosion: 0, block: 3,
  }),
];

/** 보상·상점에 나오는 카드들. */
export const POOL: Card[] = [
  card({
    id: 'p1', name: '셀레네의 완력', text: '피해 9 + (침식 ÷ 10).',
    kind: 'stigma', cost: 2, erosion: 18, damage: 9, scaling: 10, affinity: 'selene',
  }),
  card({
    id: 'p2', name: '세 달의 정렬', text: '피해 11. 카드 2장을 뽑는다.',
    kind: 'stigma', cost: 2, erosion: 16, damage: 11, draw: 2, affinity: 'lunar',
  }),
  card({
    id: 'p3', name: '굳은 손', text: '손에 든 결정 1장당 방어 5.',
    kind: 'tool', cost: 1, erosion: 0, blockPerCrystal: 5,
  }),
  card({
    id: 'p4', name: '에테르 정제수', text: '침식 6 내린다.',
    kind: 'tool', cost: 1, erosion: 0, soothe: 6,
  }),
  card({
    id: 'p5', name: '헤카테의 거울', text: '방어 10. 카드 1장을 뽑는다.',
    kind: 'stigma', cost: 2, erosion: 14, block: 10, draw: 1, affinity: 'hecate',
  }),
  card({
    id: 'p6', name: '기꺼이 타오른다', text: '피해 34. 쓰면 덱에서 사라진다.',
    kind: 'stigma', cost: 2, erosion: 26, damage: 34, exhaust: true, affinity: 'selene',
  }),
  card({
    id: 'p7', name: '세계수의 뿌리', text: '방어 8. 침식 3 내린다.',
    kind: 'tool', cost: 1, erosion: 0, block: 8, soothe: 3,
  }),
  card({
    id: 'p8', name: '과부하', text: '피해 20. 침식이 크게 오른다.',
    kind: 'stigma', cost: 1, erosion: 22, damage: 20, affinity: 'selene',
  }),
];

/** 3막 — 슬라이스는 전투 세 판이다. 마지막이 부유도시가 키운 상대. */
export const ENEMIES: Enemy[] = [
  {
    id: 'patrol',
    name: '정거장 경비',
    maxHp: 46,
    intents: [
      { damage: 8, label: '곤봉' },
      { damage: 5, block: 5, label: '방패를 세운다' },
    ],
  },
  {
    id: 'purifier',
    name: '사제단 정화관 베르낫',
    maxHp: 68,
    intents: [
      { damage: 11, label: '집전봉' },
      { erosion: 6, label: '정화 의식' },
      { damage: 14, label: '집전봉' },
    ],
  },
  {
    id: 'engine',
    name: '에테르 기관차',
    maxHp: 92,
    intents: [
      { damage: 13, label: '증기 분출' },
      { erosion: 8, label: '연료 흡인' },
      { damage: 18, block: 8, label: '가속' },
    ],
  },
];

/** 노드 이름 — 회차 경로로 남고, 깊은 공유 시 PastRun.scenePath 가 된다. */
export const NODE_LABELS = ['정거장', '정제소', '의식장', '정제소', '기관차'] as const;

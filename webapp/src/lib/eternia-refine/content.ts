// 카드·적·주인공 데이터 (#419).
//
// 세로 슬라이스라 DB 를 쓰지 않는다 — 상수로 둔다. 밸런스를 만지는 곳이 한 곳이어야
// 두 라우트를 같은 조건으로 비교할 수 있다.
//
// 카드 비용·침식량은 **이 게임의 밸런스**라 web-adventure 와 공유하지 않는다. 공유하는
// 것은 세계의 법칙(침식 0~100, 100 이면 석화)뿐이다.

import type { Ability, Act, Card, Enemy, Protagonist } from './types';

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
    faction: 'priesthood',
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
    kind: 'tool', cost: 1, erosion: 0, soothe: 6, faction: 'sylvan',
  }),
  card({
    id: 'p5', name: '헤카테의 거울', text: '방어 10. 카드 1장을 뽑는다.',
    kind: 'stigma', cost: 2, erosion: 14, block: 10, draw: 1, affinity: 'hecate',
    faction: 'ironguard',
  }),
  card({
    id: 'p6', name: '기꺼이 타오른다', text: '피해 34. 쓰면 덱에서 사라진다.',
    kind: 'stigma', cost: 2, erosion: 26, damage: 34, exhaust: true, affinity: 'selene',
    faction: 'priesthood',
  }),
  card({
    id: 'p7', name: '세계수의 뿌리', text: '방어 8. 침식 3 내린다.',
    kind: 'tool', cost: 1, erosion: 0, block: 8, soothe: 3, faction: 'sylvan',
  }),
  card({
    id: 'p8', name: '과부하', text: '피해 20. 침식이 크게 오른다.',
    kind: 'stigma', cost: 1, erosion: 22, damage: 20, affinity: 'selene',
    faction: 'ironguard',
  }),

  // ── 아이언가드 — 막고 되받는다 ──────────────────────────────────
  //
  // 성흔에 기대지 않는다. 침식이 안 오르는 대신 한 방이 작다. **도구가 많아** 무흔으로도
  // 이 길을 갈 수 있다(성흔 카드를 못 사는 성흔이라 도구가 없으면 굶는다).
  card({
    id: 'i1', name: '붉은 천', text: '방어 9.',
    kind: 'tool', cost: 1, erosion: 0, block: 9, faction: 'ironguard',
  }),
  card({
    id: 'i2', name: '방패 밀치기', text: '피해 5. 방어 5.',
    kind: 'tool', cost: 1, erosion: 0, damage: 5, block: 5, faction: 'ironguard',
  }),
  card({
    id: 'i3', name: '대열', text: '방어 4. 값이 없다.',
    kind: 'tool', cost: 0, erosion: 0, block: 4, faction: 'ironguard',
  }),
  card({
    id: 'i4', name: '징발한 소총', text: '피해 14.',
    kind: 'tool', cost: 2, erosion: 0, damage: 14, faction: 'ironguard',
  }),

  // ── 사제단 — 태워서 크게 얻는다 ─────────────────────────────────
  //
  // 가장 세고 가장 가파르다. 결정을 자원으로 쓰는 길도 여기 있다 — 태우는 것이 축복이라는
  // 교리가 규칙이 된 자리다.
  card({
    id: 'r1', name: '축복', text: '체력 10 회복. 살은 굳는다.',
    kind: 'stigma', cost: 1, erosion: 14, heal: 10, faction: 'priesthood',
  }),
  card({
    id: 'r2', name: '연료 헌납', text: '손에 든 결정 1장당 방어 7.',
    kind: 'tool', cost: 1, erosion: 0, blockPerCrystal: 7, faction: 'priesthood',
  }),
  card({
    id: 'r3', name: '정화 의식', text: '피해 16. 카드 1장을 뽑는다.',
    kind: 'stigma', cost: 2, erosion: 20, damage: 16, draw: 1, faction: 'priesthood',
  }),
  card({
    id: 'r4', name: '집전봉', text: '피해 12.',
    kind: 'stigma', cost: 1, erosion: 12, damage: 12, faction: 'priesthood',
  }),

  // ── 네오엘프 — 되돌린다 ────────────────────────────────────────
  //
  // 한 방이 가장 약하다. 대신 **침식을 되돌리는 유일한 길**이라 오래 버틴다.
  // 결정을 안 만들면 정제소에 팔 것도 없고, 그것이 이 길의 결말로 이어진다.
  card({
    id: 'y1', name: '숨 고르기', text: '침식 4 내린다. 값이 없다.',
    kind: 'tool', cost: 0, erosion: 0, soothe: 4, faction: 'sylvan',
  }),
  card({
    id: 'y2', name: '이끼 붕대', text: '체력 6 회복. 침식 2 내린다.',
    kind: 'tool', cost: 1, erosion: 0, heal: 6, soothe: 2, faction: 'sylvan',
  }),
  card({
    id: 'y3', name: '뿌리 감옥', text: '방어 12. 침식 4 내린다.',
    kind: 'tool', cost: 2, erosion: 0, block: 12, soothe: 4, faction: 'sylvan',
  }),
  card({
    id: 'y4', name: '달빛 여과', text: '카드 1장을 뽑는다. 침식 3 내린다.',
    kind: 'tool', cost: 1, erosion: 0, draw: 1, soothe: 3, faction: 'sylvan',
  }),

  // ── 중립 — 어느 길에서도 나온다 ────────────────────────────────
  //
  // 동맹을 고르면 세력 카드는 하나만 남으므로, 중립이 얇으면 보상이 거의 고정된다.
  // 바닥을 여기서 받친다.
  card({
    id: 'n1', name: '날붙이', text: '피해 9.',
    kind: 'tool', cost: 1, erosion: 0, damage: 9,
  }),
  card({
    id: 'n2', name: '한숨 돌리기', text: '체력 7 회복.',
    kind: 'tool', cost: 1, erosion: 0, heal: 7,
  }),
  card({
    id: 'n3', name: '틈새', text: '카드 1장을 뽑는다. 값이 없다.',
    kind: 'tool', cost: 0, erosion: 0, draw: 1,
  }),
  card({
    id: 'n4', name: '버티기', text: '방어 7.',
    kind: 'tool', cost: 1, erosion: 0, block: 7,
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

  // 막마다 상대가 하나뿐이면 15노드를 도는 동안 같은 싸움이 반복된다 (#437).
  {
    id: 'automaton',
    name: '역무원 자동인형',
    maxHp: 40,
    intents: [
      { block: 8, label: '태엽을 감는다' },
      { damage: 10, label: '집게' },
    ],
  },
  {
    id: 'patrol_squad',
    name: '광장 순찰대',
    maxHp: 62,
    intents: [
      { damage: 7, label: '곤봉' },
      { damage: 7, label: '곤봉' },
      { damage: 15, label: '합을 맞춘다' },
    ],
  },
  {
    id: 'overseer',
    name: '연료 감독관',
    maxHp: 80,
    intents: [
      { erosion: 7, label: '장부를 읽는다' },
      { damage: 16, label: '낙인' },
      { damage: 9, block: 6, label: '물러서며 벤다' },
    ],
  },
];

/** 막 이름 — 회차 경로로 남고, 깊은 공유 시 PastRun.scenePath 가 된다. */
export const NODE_LABELS = ['정거장', '옴팔로스', '에테르 열차'] as const;

/**
 * 막마다 나오는 잡졸들 (#430). 뒤로 갈수록 험해진다.
 *
 * 지금은 적이 셋뿐이라 막마다 하나씩 나눠 쓴다 — 콘텐츠 확장은 다음 PR 몫이고,
 * 여기 배열만 늘리면 지도는 그대로 굴러간다.
 */
export function actEnemies(act: Act): Enemy[] {
  const by = (id: string) => ENEMIES.find((e) => e.id === id)!;
  if (act === 1) return [by('patrol'), by('automaton')];
  if (act === 2) return [by('patrol_squad'), by('purifier')];
  return [by('overseer'), by('purifier')];
}

/** 막의 끝에서 기다리는 것. 3막 보스가 부유도시를 업고 나온다. */
export function bossFor(act: Act): Enemy {
  const by = (id: string) => ENEMIES.find((e) => e.id === id)!;
  if (act === 1) return by('automaton');
  if (act === 2) return by('purifier');
  return by('engine');
}

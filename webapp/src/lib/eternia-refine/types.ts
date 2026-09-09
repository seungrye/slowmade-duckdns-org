// 〈에테르니아: 정제〉 덱빌딩 타입 (#419).
//
// 카드·적·회차의 모양은 이 게임 것이라 여기서 정의한다. 세계의 법칙(침식)은
// `stigma.ts` 가 web-adventure 에서 가져온다.
//
// **엔딩 id 는** `@/types/web-adventure` 의 것을 쓴다. 나중에 회차를
// PastRun 으로 흘려보내(피드백 노트) 깊은 공유를 얹을 때, 자체 id 를 발명해 뒀으면
// 번역 계층이 필요해지기 때문이다. 이 한 줄이 그 문을 열어 둔다.

import type { EndingId } from '@/types/web-adventure';

export type { EndingId };

/** 성흔 — 침식 수치를 저마다 다르게 읽는다. web-adventure 의 AbilityKey 와 같은 값. */
export type Ability = 'lunar' | 'selene' | 'hecate' | 'none';

/** 주인공 — 시작 침식이 곧 난이도다. */
export type Protagonist = 'kael' | 'rin' | 'solwen';

/**
 * 카드 종류.
 *   stigma   — 가장 강하다. 쓸 때마다 침식이 오른다.
 *   tool     — 침식이 오르지 않는다. 대신 약하다.
 *   refine   — 결정을 태워 에테르로 바꾼다. 도시가 그만큼 자란다.
 *   crystal  — 침식이 만들어 낸 것. 쓸 수 없고 손을 한 칸 차지한다. 제거 불가.
 */
export type CardKind = 'stigma' | 'tool' | 'refine' | 'crystal';

export interface Card {
  id: string;
  name: string;
  text: string;
  kind: CardKind;
  /** 에테르 비용. crystal 은 낼 수 없으므로 null. */
  cost: number | null;
  /** 사용 시 오르는 침식. tool·refine·crystal 은 0. */
  erosion: number;
  /** 고정 피해. `scaling` 이 있으면 거기에 더해진다. */
  damage?: number;
  /** 침식에 비례하는 피해 — 셀레네 계열. 피해 += floor(침식 / 이 값). */
  scaling?: number;
  /** 방어. */
  block?: number;
  /** 손에 든 결정 1장당 방어 — 결정을 자원으로 바꾸는 카드. */
  blockPerCrystal?: number;
  /** 뽑을 카드 수. */
  draw?: number;
  /** 체력 회복. */
  heal?: number;
  /** 침식 감소(정제수). 양수면 내려간다. */
  soothe?: number;
  /** 성흔 계열 — 그 성흔이면 효과가 더 붙는다. */
  affinity?: Ability;
  /** 사용 후 덱에서 영구히 사라진다. */
  exhaust?: boolean;
}

export interface Enemy {
  id: string;
  name: string;
  maxHp: number;
  /** 매 턴 반복하는 의도. 턴마다 순서대로 돌아간다. */
  intents: EnemyIntent[];
}

export interface EnemyIntent {
  /** 플레이어에게 줄 피해. */
  damage?: number;
  /** 플레이어의 침식을 올린다 — 사제단의 정화 의식. */
  erosion?: number;
  /** 자신에게 붙이는 방어. */
  block?: number;
  label: string;
}

/** 전투 한 판의 상태. */
export interface CombatState {
  hp: number;
  maxHp: number;
  block: number;
  ether: number;
  maxEther: number;
  erosion: number;
  hand: Card[];
  deck: Card[];
  discard: Card[];
  /** 소멸(exhaust)된 카드 — 덱으로 돌아오지 않는다. */
  exhausted: Card[];
  enemy: Enemy;
  enemyHp: number;
  enemyBlock: number;
  /** 지금까지 진행한 턴 수. 적 의도가 이 값으로 정해진다. */
  turn: number;
  /** 끝났는가. null 이면 진행 중. */
  outcome: 'win' | 'lose' | 'petrified' | null;
  log: string[];
}

/** 회차 전체의 상태 — 전투 밖에서도 이어지는 것. */
export interface RunState {
  protagonist: Protagonist;
  ability: Ability;
  erosion: number;
  hp: number;
  maxHp: number;
  ether: number;
  /** 덱 전체(전투 중이 아닐 때의 정본). */
  deck: Card[];
  /** 정제해 판 결정의 누계 — 엔딩 판정의 핵심 입력. */
  refined: number;
  /** 판 결정이 키운 부유도시. 최종 보스가 이만큼 강해진다. */
  cityPower: number;
  /** 지나온 노드 — 깊은 공유 시 PastRun.scenePath 로 그대로 간다. */
  path: string[];
  /** 회차 서사 로그 — 깊은 공유 시 PastRun.log 로 간다(피드백 노트의 LLM 입력). */
  log: string[];
  /** world.* 부메랑 플래그. web-adventure 와 같은 모양. */
  flags: Record<string, boolean>;
}

/**
 * 회차가 끝났을 때 넘길 것 — **깊은 공유의 이음매**.
 *
 * 지금은 로컬 구현만 있다. 나중에 PastRun 으로 흘려보내려면 이 인터페이스의 두 번째
 * 구현체(`/api/web-adventure/end-run` 으로 POST)를 쓰면 되고, 게임 코드는 손대지 않는다.
 * 그래서 필드 이름을 PastRun 과 맞춰 뒀다.
 */
export interface RunResult {
  endingId: EndingId;
  protagonist: Protagonist;
  erosion: number;
  scenePath: string[];
  log: string[];
  flags: Record<string, boolean>;
  refined: number;
  cityPower: number;
}

export interface RunSink {
  submit(result: RunResult): Promise<void>;
}

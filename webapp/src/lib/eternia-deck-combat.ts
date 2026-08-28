// 에테르니아 덱빌딩 로그라이크 — 전투 규칙과 상태 전이.
//
// 회차 상태는 전부 평범한 값이다. JSON 을 거쳐 되돌려도 같은 값이어야 한다.
//
// 적 행동은 시드에서 뽑지 않는다. moves 를 순서대로 돌린다 — 시드에 묶으면 셔플 시드와
// 얽혀 테스트가 읽기 어려워진다.
//
// ── 1 차 껍데기 ────────────────────────────────────────────────────────────
// 타입과 시그니처만 있고 본문은 함수마다 **다른 문구로** 던진다. 규칙은 한 줄도 여기
// 없다 — 코더 몫이다.

import type { CardId } from "./eternia-deck-cards";
import type { RngState } from "./eternia-deck-rng";

/** 회차 결말. 진행 중이거나, 이겼거나, 졌거나. */
export type Outcome = "ongoing" | "won" | "lost";

/** 적 행동. 1 차는 attack 하나뿐이다. */
export type EnemyMove = {
  kind: "attack";
  amount: number;
};

/** 플레이어 상태. 방어도(block)는 턴을 넘기지 않는다. */
export type PlayerState = {
  hp: number;
  block: number;
  energy: number;
};

/** 적 상태. moveIndex 는 매 턴 다음 칸으로 넘어가고 끝에 닿으면 처음으로 돌아온다. */
export type EnemyState = {
  hp: number;
  moves: EnemyMove[];
  moveIndex: number;
};

/** createRun 에 넘기는 적 설정. moveIndex 는 늘 0 에서 시작하므로 받지 않는다. */
export type EnemySetup = {
  hp: number;
  moves: EnemyMove[];
};

/** 한 회차의 상태. 전부 평범한 값이라야 한다. */
export type RunState = {
  /** 난수 상태. 수 하나. */
  rngState: RngState;
  player: PlayerState;
  enemy: EnemyState;
  /** 뽑기 더미. 맨 앞에서 뽑는다. */
  drawPile: CardId[];
  hand: CardId[];
  discardPile: CardId[];
  /** 1 부터. */
  turn: number;
  outcome: Outcome;
};

/**
 * 회차 시작 상태를 낸다.
 *
 * 플레이어 hp 50, block 0, energy 3. 적 기본값은 hp 40 이고 moves 는 8 짜리 attack 과
 * 12 짜리 attack 둘. STARTER_DECK 을 시드로 섞어 drawPile 에 넣고 다섯 장을 뽑아
 * hand 에 둔다. turn 은 1, outcome 은 ongoing.
 */
export function createRun(_seed: number, _enemy?: EnemySetup): RunState {
  throw new Error("createRun 미구현");
}

/**
 * 카드 한 장을 내고 새 상태를 낸다.
 *
 * 낼 수 없으면 예외를 던지지 않고 **상태를 값으로 그대로** 돌려준다.
 */
export function playCard(_state: RunState, _cardId: CardId): RunState {
  throw new Error("playCard 미구현");
}

/**
 * 턴을 넘기고 새 상태를 낸다.
 *
 * 손패를 전부 버리고, 적이 예고한 행동을 실행하고, 방어도를 0 으로 만든 뒤,
 * 살아 있으면 다음 턴을 연다.
 */
export function endTurn(_state: RunState): RunState {
  throw new Error("endTurn 미구현");
}

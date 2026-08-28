// 에테르니아 덱빌딩 로그라이크 — 결정적 난수.
//
// 시드는 회차 시작에 한 번 정해져 회차 내내 산다 (회차 번호에서 파생시키지 않는다 —
// 그러면 3 회차가 영원히 같은 3 회차가 된다).
//
// 상태는 **직렬화 가능한 수 하나**다. 함수 참조나 클로저를 담으면 나중에 저장·재개를
// 붙일 때 JSON 을 못 건넌다.
//
// ── 1 차 껍데기 ────────────────────────────────────────────────────────────
// 지금은 타입과 시그니처만 있고 본문은 함수마다 **다른 문구로** 던진다. 알맹이는
// 코더가 채운다. 문구를 함수마다 다르게 두는 이유는 빨강의 실패 사유가 한 종류로
// 뭉치지 않게 하기 위해서다.

/** 난수 상태. JSON 을 거쳐 되돌려도 같은 값이어야 하므로 수 하나여야 한다. */
export type RngState = number;

/** nextRandom 의 결과 — 0 이상 1 미만의 값과, 다음 호출에 넘길 새 상태. */
export type RandomResult = {
  value: number;
  state: RngState;
};

/** shuffle 의 결과 — 섞인 **새** 배열과, 다음 호출에 넘길 새 상태. */
export type ShuffleResult<T> = {
  items: T[];
  state: RngState;
};

/**
 * 상태 하나에서 [0, 1) 난수와 다음 상태를 낸다.
 *
 * 같은 state 를 넣으면 늘 같은 것이 나온다.
 */
export function nextRandom(_state: RngState): RandomResult {
  throw new Error("nextRandom 미구현");
}

/**
 * Fisher-Yates 로 섞은 **새** 배열과 다음 상태를 낸다.
 *
 * - 입력 배열을 변형하지 않는다.
 * - 빈 배열과 한 장짜리 배열도 예외 없이 받는다.
 */
export function shuffle<T>(_items: readonly T[], _state: RngState): ShuffleResult<T> {
  throw new Error("shuffle 미구현");
}

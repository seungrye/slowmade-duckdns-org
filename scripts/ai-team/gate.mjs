// 파이프라인 게이트 판정 (#269).
//
// 클로드가 테스트를 쓰고 코더가 구현한다. 그 사이에 문이 둘 있다 — **빨강**(구현 없이 정말
// 실패하는가)과 **초록**(구현으로 정말 통과했는가). 이 판정이 틀리면 파이프라인 전체가
// 아무것도 보장하지 못한다.
//
// 지금 하네스는 **종료 코드만** 본다(`scripts/ai-team/coder.mjs:59`). 새 모듈이면 "모듈
// 없음" 으로 테스트가 **0건 수집**돼도 종료 코드가 0 이 아니라 빨강으로 잡힌다 — 빨강을
// 통과한 것이 아니라 아무것도 안 잰 것이다. 여기서 그 구멍을 막는다.
//
// 판정만 여기 둔다. 실제로 vitest 를 돌리고 파일을 되돌리는 일은 파이프라인 스크립트가
// 한다 — 그래야 이 규칙을 네트워크·파일 없이 시험할 수 있다.

/**
 * 문 판정 결과.
 *
 * 스크립트(node)와 테스트(vitest)가 **같은 파일**을 쓴다. 두 벌로 두면 한쪽만 고쳐지는
 * 날이 온다 — 그래서 TS 가 아니라 평범한 ESM 으로 둔다.
 */
export const GateVerdict = Object.freeze({
  /** 문을 통과했다. */
  PASS: 'PASS',

  /** 한 건도 안 모였다 — 아무것도 재지 못했다. */
  NOTHING_COLLECTED: 'NOTHING_COLLECTED',

  /** 구현이 없는데 통과했다 — 아무것도 안 잡는 테스트다. */
  UNEXPECTED_PASS: 'UNEXPECTED_PASS',

  /** 아직 실패가 남았다. */
  FAILING: 'FAILING',

  /** 테스트 파일이 바뀌었다 — 구현이 아니라 테스트를 고쳐 통과시킨 것이다. */
  TEST_TOUCHED: 'TEST_TOUCHED',
});

/**
 * 빨강 문 — 구현 없이 **정말** 실패하는가.
 *
 * `수집 ≥ 1 && 통과 0` 이어야 한다. 종료 코드만 보면 0건 수집을 빨강으로 착각한다.
 * **못 읽으면 통과시키지 않는다** — 모르는 것을 통과로 치면 문이 없는 것과 같다.
 */
export function redGate(counts) {
  if (!counts || counts.numTotalTests <= 0) return GateVerdict.NOTHING_COLLECTED;
  if (counts.numPassedTests > 0) return GateVerdict.UNEXPECTED_PASS;
  return GateVerdict.PASS;
}

/**
 * 실패 메시지들에서 **서로 다른 사유**만 골라낸다.
 *
 * 빨강 게이트는 "수집 ≥ 1 && 통과 0" 만 본다 — "테스트가 돌긴 한다" 는 증명이지 "테스트가
 * 스펙을 구별한다" 는 증명이 아니다. 사유의 종수를 세려면 먼저 메시지를 정규화해야 한다:
 * 첫 줄만 취하고(스택은 버린다), 양끝 공백을 떼고, 절대 경로는 `<경로>` 로 바꾼다
 * (워크트리 경로에 실행 시각이 박혀 있어 그대로 두면 실행마다 사유가 달라진다).
 *
 * @param {readonly unknown[]|null|undefined} messages 실패 메시지들.
 * @returns {string[]} 처음 나온 순서를 지킨, 서로 다른 사유들.
 */
export function failureKinds(messages) {
  throw new Error(`failureKinds 미구현: ${messages}`);
}

/**
 * 빨강이 스펙을 구별하는지에 대한 **경고 한 줄**. 경고할 것이 없으면 null.
 *
 * 게이트가 아니라 경고다 — **막지 않는다.** 껍데기 throw 하나로 전부 실패하는 것은 정상
 * 패턴이라 진행을 멈출 근거가 못 된다. 아침에 사람이 로그에서 보고 판단할 한 줄이면 된다.
 * 그래서 태도도 게이트와 반대다: **모르면(사유를 못 셌으면) 잠자코 있는다.**
 *
 * @param {{numTotalTests:number,numPassedTests:number}|null|undefined} counts redGate 가 받는 것과 같은 모양.
 * @param {readonly unknown[]|null|undefined} messages 실패 메시지들.
 * @returns {string|null} 경고 문구, 또는 경고할 것이 없으면 null.
 */
export function redDiscriminationWarning(counts, messages) {
  throw new Error(`redDiscriminationWarning 미구현: ${counts} ${messages}`);
}

/**
 * 초록 문 — 구현으로 **정말** 통과했는가.
 *
 * **테스트 파일이 바뀌었으면 통과로 치지 않는다.** 코더가 테스트를 고쳐 초록을 만드는 것을
 * 막는 것이 이 프로세스의 핵심 규칙이다 — 테스트는 클로드 것이고 책임도 클로드가 진다.
 *
 * @param {{numTotalTests:number,numPassedTests:number}|null} counts vitest json 리포터 값.
 * @param {readonly string[]} changedTestFiles 이 단계에서 바뀐 테스트 파일들. 비어 있어야 정상이다.
 */
export function greenGate(counts, changedTestFiles) {
  if (changedTestFiles.length > 0) return GateVerdict.TEST_TOUCHED;
  if (!counts || counts.numTotalTests <= 0) return GateVerdict.NOTHING_COLLECTED;
  if (counts.numPassedTests < counts.numTotalTests) return GateVerdict.FAILING;
  return GateVerdict.PASS;
}

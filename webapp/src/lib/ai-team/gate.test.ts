// 파이프라인 게이트 판정 (#269).
//
// 클로드가 테스트를 쓰고 코더가 구현한다. 그 사이에 두 개의 문이 있다 — **빨강**(구현 없이
// 정말 실패하는가)과 **초록**(구현으로 정말 통과했는가). 이 판정이 틀리면 파이프라인 전체가
// 아무것도 보장하지 못한다.
//
// 지금 하네스는 **종료 코드만** 본다(`coder.mjs:59`). 새 모듈이면 "모듈 없음" 으로 테스트가
// **0건 수집**돼도 종료 코드가 0 이 아니라 빨강으로 잡힌다 — 빨강을 통과한 것이 아니라
// 아무것도 안 잰 것이다. 그 구멍을 여기서 막는다.
import { describe, it, expect } from 'vitest';
// 스크립트와 **같은 파일**을 시험한다. 두 벌로 두면 한쪽만 고쳐지는 날이 온다.
import { redGate, greenGate, GateVerdict } from '../../../../scripts/ai-team/gate.mjs';

/** vitest json 리포터가 내는 모양 중 우리가 보는 것만. */
const 결과 = (총: number, 통과: number) => ({ numTotalTests: 총, numPassedTests: 통과 });

describe('redGate — 구현 없이 정말 실패하는가', () => {
  it('테스트가 모이고 하나도 안 통과하면 빨강이다', () => {
    expect(redGate(결과(5, 0))).toBe(GateVerdict.PASS);
  });

  // 이게 이 게이트를 다시 짠 이유다. 종료 코드만 보면 이걸 빨강으로 착각한다.
  it('한 건도 안 모였으면 빨강이 아니다 — 아무것도 재지 않았다', () => {
    expect(redGate(결과(0, 0))).toBe(GateVerdict.NOTHING_COLLECTED);
  });

  it('하나라도 통과하면 빨강이 아니다 — 구현 없이 통과하는 테스트다', () => {
    expect(redGate(결과(5, 1))).toBe(GateVerdict.UNEXPECTED_PASS);
  });

  it('전부 통과하면 당연히 빨강이 아니다', () => {
    expect(redGate(결과(5, 5))).toBe(GateVerdict.UNEXPECTED_PASS);
  });

  // 리포터를 못 읽었을 때. 못 읽었으면 통과시키지 않는다.
  it('결과를 못 읽으면 통과시키지 않는다', () => {
    expect(redGate(null)).toBe(GateVerdict.NOTHING_COLLECTED);
  });
});

describe('greenGate — 구현으로 정말 통과했는가', () => {
  it('모인 만큼 다 통과하면 초록이다', () => {
    expect(greenGate(결과(5, 5), [])).toBe(GateVerdict.PASS);
  });

  it('하나라도 실패하면 초록이 아니다', () => {
    expect(greenGate(결과(5, 4), [])).toBe(GateVerdict.FAILING);
  });

  it('한 건도 안 모였으면 초록이 아니다 — 통과할 것이 없었다', () => {
    expect(greenGate(결과(0, 0), [])).toBe(GateVerdict.NOTHING_COLLECTED);
  });

  // **코더가 테스트를 고쳐서 초록을 만드는 것**을 막는다. 이 프로세스의 핵심 규칙이다.
  it('테스트 파일이 바뀌었으면 초록으로 치지 않는다', () => {
    expect(greenGate(결과(5, 5), ['webapp/src/lib/a.test.ts'])).toBe(GateVerdict.TEST_TOUCHED);
  });

  it('테스트가 바뀌었으면 다 통과했어도 막는다', () => {
    expect(greenGate(결과(99, 99), ['webapp/src/x.test.tsx'])).toBe(GateVerdict.TEST_TOUCHED);
  });

  it('결과를 못 읽으면 통과시키지 않는다', () => {
    expect(greenGate(null, [])).toBe(GateVerdict.NOTHING_COLLECTED);
  });
});

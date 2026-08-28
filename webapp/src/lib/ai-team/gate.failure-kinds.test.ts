// 빨강이 스펙을 **구별**하는가 — 실패 사유의 종수 세기.
//
// 빨강 게이트는 "수집 ≥ 1 && 통과 0" 만 본다(`gate.mjs:43`). 그건 "테스트가 돌긴 한다" 는
// 증명이지 "테스트가 스펙을 구별한다" 는 증명이 아니다. 첫 성공 실행에서 빨강 61건이
// **전부 같은 에러**였다 — 클로드가 쓴 껍데기의 throw 하나. 61건이 재어진 것처럼 보였지만
// 실제로 구별된 것은 0가지다.
//
// 그래서 빨강 단계에서 **서로 다른 실패 사유가 몇 가지인지** 센다. 한 가지뿐이면 경고만
// 남긴다 — **막지는 않는다.** 껍데기 throw 는 정상 패턴이라 진행을 멈출 근거가 못 된다.
//
// **기존 `gate.test.ts` 에 덧붙이지 않고 파일을 나눈 이유**: 빨강 게이트는 지정된 테스트
// 파일들에서 통과가 0건이어야 한다. 이미 통과하는 테스트가 든 파일에 덧붙이면 빨강 게이트가
// UNEXPECTED_PASS 로 즉시 죽는다.
import { describe, it, expect } from 'vitest';
// 스크립트와 **같은 파일**을 시험한다. 두 벌로 두면 한쪽만 고쳐지는 날이 온다.
import { failureKinds, redDiscriminationWarning } from '../../../../scripts/ai-team/gate.mjs';

/** vitest json 리포터가 내는 모양 중 우리가 보는 것만. */
const 결과 = (총: number, 통과: number) => ({ numTotalTests: 총, numPassedTests: 통과 });

/** 스펙이 못박은 경고 문구. 코더가 문구를 바꾸면 여기서 걸린다. */
const 경고 = (건수: number, 사유: string) =>
  `빨강 ${건수}건이 전부 같은 사유입니다 — 테스트가 스펙을 구별하는지 아직 증명되지 않았습니다: ${사유}`;

describe('failureKinds — 실패 메시지에서 서로 다른 사유만 골라낸다', () => {
  it('서로 다른 메시지는 각각 한 가지로 센다', () => {
    expect(failureKinds(['A 실패', 'B 실패'])).toEqual(['A 실패', 'B 실패']);
  });

  // 못 읽었을 때. 여기서 뭘 지어내면 아래 경고가 통째로 거짓말이 된다.
  it('null 이면 빈 배열이다', () => {
    expect(failureKinds(null)).toEqual([]);
  });

  it('undefined 면 빈 배열이다', () => {
    expect(failureKinds(undefined)).toEqual([]);
  });

  it('빈 배열이면 빈 배열이다', () => {
    expect(failureKinds([])).toEqual([]);
  });

  it('빈 문자열·공백뿐·줄바꿈뿐인 항목은 사유로 세지 않는다', () => {
    expect(failureKinds(['', '   ', '\n', '\t \n \t'])).toEqual([]);
  });

  // 스택만 있고 첫 줄이 빈 메시지. 정규화하면 빈 문자열이라 셀 것이 없다.
  it('첫 줄이 비어 있으면 뒤에 스택이 붙어 있어도 세지 않는다', () => {
    expect(failureKinds(['\n    at Object.<anonymous> (x.ts:1:1)'])).toEqual([]);
  });

  it('문자열이 아닌 항목은 그 항목만 건너뛴다', () => {
    expect(failureKinds(['터짐', null, undefined, 42, { message: '터짐2' }, ['터짐3'], '깨짐']))
      .toEqual(['터짐', '깨짐']);
  });

  it('항목이 전부 문자열이 아니면 빈 배열이다', () => {
    expect(failureKinds([null, undefined, 0, false, {}])).toEqual([]);
  });

  it('같은 메시지가 두 번 나와도 한 가지다', () => {
    expect(failureKinds(['같은 에러', '같은 에러'])).toEqual(['같은 에러']);
  });

  // 첫 성공 실행에서 실제로 벌어진 일 — 61건이 전부 같은 껍데기 throw 였다.
  it('61건이 전부 같은 메시지면 한 가지다', () => {
    expect(failureKinds(Array(61).fill('Error: 구현 필요'))).toEqual(['Error: 구현 필요']);
  });

  it('처음 나온 순서를 지킨다', () => {
    expect(failureKinds(['B', 'A', 'B'])).toEqual(['B', 'A']);
  });

  it('첫 줄만 취하고 스택 트레이스는 버린다', () => {
    expect(failureKinds(['Error: 구현 필요\n    at failureKinds (gate.mjs:70:9)\n    at run']))
      .toEqual(['Error: 구현 필요']);
  });

  it('첫 줄이 같고 스택만 다르면 한 가지다', () => {
    expect(failureKinds([
      'Error: 구현 필요\n    at a (gate.mjs:70:9)',
      'Error: 구현 필요\n    at b (gate.mjs:99:3)',
    ])).toEqual(['Error: 구현 필요']);
  });

  it('앞뒤 공백은 뗀다', () => {
    expect(failureKinds(['   터짐   '])).toEqual(['터짐']);
  });

  it('공백 차이뿐인 메시지는 한 가지다', () => {
    expect(failureKinds(['  터짐  ', '터짐', '터짐\n    at x'])).toEqual(['터짐']);
  });

  // 워크트리 경로에 실행 시각이 박혀 있다. 그대로 두면 실행마다 사유가 달라져 종수 세기가
  // 아무 의미도 없어진다.
  it('절대 경로만 다른 두 메시지는 한 가지다 — 경로가 자리표시자로 바뀐다', () => {
    expect(failureKinds([
      '모듈 없음: /tmp/ai-pipeline-111/webapp/src/x.ts',
      '모듈 없음: /tmp/ai-pipeline-222/webapp/src/x.ts',
    ])).toEqual(['모듈 없음: <경로>']);
  });

  it('첫 줄에 절대 경로가 둘이면 둘 다 바뀐다', () => {
    expect(failureKinds(['/tmp/a/b.ts 에서 /tmp/c/d.ts 를 못 찾음']))
      .toEqual(['<경로> 에서 <경로> 를 못 찾음']);
  });

  it('절대 경로만 있는 메시지도 사유로 센다', () => {
    expect(failureKinds(['/tmp/ai-pipeline-333/webapp/src/x.ts'])).toEqual(['<경로>']);
  });

  it('앞에 공백이 붙은 절대 경로도 바꾼다 — 공백을 떼면 맨 앞이다', () => {
    expect(failureKinds(['   /tmp/a/b.ts 실패'])).toEqual(['<경로> 실패']);
  });

  it('상대 경로는 바꾸지 않는다 — 슬래시로 시작하지 않는다', () => {
    expect(failureKinds(['모듈 없음: ./gate.mjs ../scripts/x.mjs src/lib/a.ts']))
      .toEqual(['모듈 없음: ./gate.mjs ../scripts/x.mjs src/lib/a.ts']);
  });

  it('둘째 줄의 절대 경로는 애초에 안 본다 — 첫 줄만 취한다', () => {
    expect(failureKinds([
      '같은 사유\n    at /tmp/ai-pipeline-111/x.ts:1:1',
      '같은 사유\n    at /tmp/ai-pipeline-222/x.ts:9:9',
    ])).toEqual(['같은 사유']);
  });
});

describe('redDiscriminationWarning — 빨강이 스펙을 구별하는지에 대한 경고 한 줄', () => {
  it('사유가 한 가지뿐이면 경고한다', () => {
    expect(redDiscriminationWarning(결과(61, 0), Array(61).fill('Error: 구현 필요'))).toBe(
      '빨강 61건이 전부 같은 사유입니다 — 테스트가 스펙을 구별하는지 아직 증명되지 않았습니다: Error: 구현 필요',
    );
  });

  // 못 읽은 것이지 판별력 문제가 아니다.
  it('counts 를 못 읽으면 경고하지 않는다', () => {
    expect(redDiscriminationWarning(null, ['하나뿐인 사유'])).toBeNull();
    expect(redDiscriminationWarning(undefined, ['하나뿐인 사유'])).toBeNull();
  });

  it('한 건뿐이면 경고하지 않는다 — 사유가 한 가지인 게 당연하다', () => {
    expect(redDiscriminationWarning(결과(1, 0), ['하나뿐인 사유'])).toBeNull();
  });

  it('한 건도 안 모였으면 경고하지 않는다', () => {
    expect(redDiscriminationWarning(결과(0, 0), ['하나뿐인 사유'])).toBeNull();
  });

  // 빨강 게이트와 태도가 다르다. 게이트는 막는 것이라 모르면 안 통과시키지만, 이건 경고라
  // 모를 때 떠들면 소음만 된다.
  it('실패 메시지를 못 읽으면 경고하지 않는다 — 모르는 것을 경고하지 않는다', () => {
    expect(redDiscriminationWarning(결과(2, 0), null)).toBeNull();
    expect(redDiscriminationWarning(결과(2, 0), undefined)).toBeNull();
    expect(redDiscriminationWarning(결과(2, 0), [])).toBeNull();
  });

  it('셀 사유가 하나도 없으면 경고하지 않는다', () => {
    expect(redDiscriminationWarning(결과(2, 0), ['', '   ', '\n'])).toBeNull();
  });

  it('사유가 둘이면 경고하지 않는다 — 구별되고 있다', () => {
    expect(redDiscriminationWarning(결과(2, 0), ['A 실패', 'B 실패'])).toBeNull();
  });

  it('경로만 달라 사유가 한 가지로 합쳐지면 경고한다', () => {
    expect(redDiscriminationWarning(결과(2, 0), [
      '모듈 없음: /tmp/ai-pipeline-111/x.ts',
      '모듈 없음: /tmp/ai-pipeline-222/x.ts',
    ])).toBe(경고(2, '모듈 없음: <경로>'));
  });

  it('두 건이고 사유가 한 가지면 경고한다 — 경계값', () => {
    expect(redDiscriminationWarning(결과(2, 0), ['같은 에러', '같은 에러'])).toBe(
      경고(2, '같은 에러'),
    );
  });

  // 통과 건이 있는지는 redGate 의 일이다. 여기서 겹쳐 보면 판정이 두 군데로 갈린다.
  it('numPassedTests 는 보지 않는다', () => {
    expect(redDiscriminationWarning(결과(5, 3), ['같은 에러'])).toBe(경고(5, '같은 에러'));
    expect(redDiscriminationWarning(결과(5, 5), ['같은 에러'])).toBe(경고(5, '같은 에러'));
  });

  it('문자열이 아닌 항목이 섞여 있어도 남은 한 가지로 경고한다', () => {
    expect(redDiscriminationWarning(결과(3, 0), ['같은 에러', null, 42, '같은 에러'])).toBe(
      경고(3, '같은 에러'),
    );
  });

  it('사유가 201자면 앞 200자만 남기고 말줄임표를 붙인다', () => {
    expect(redDiscriminationWarning(결과(2, 0), ['x'.repeat(201)])).toBe(
      경고(2, `${'x'.repeat(200)}…`),
    );
  });

  it('사유가 정확히 200자면 자르지 않고 말줄임표도 붙이지 않는다', () => {
    expect(redDiscriminationWarning(결과(2, 0), ['x'.repeat(200)])).toBe(
      경고(2, 'x'.repeat(200)),
    );
  });

  it('199자도 그대로 둔다', () => {
    expect(redDiscriminationWarning(결과(2, 0), ['x'.repeat(199)])).toBe(
      경고(2, 'x'.repeat(199)),
    );
  });

  // 자르는 것은 **정규화한 뒤**의 사유다. 스택까지 세면 200자가 스택으로 채워진다.
  it('길이는 정규화한 뒤로 잰다 — 첫 줄이 201자면 잘리고 스택은 애초에 안 센다', () => {
    expect(redDiscriminationWarning(결과(2, 0), [`${'y'.repeat(201)}\n    at /tmp/a/b.ts:1:1`])).toBe(
      경고(2, `${'y'.repeat(200)}…`),
    );
  });
});

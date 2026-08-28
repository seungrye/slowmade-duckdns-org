// 에이전트 호출이 한 번 실패했다고 파이프라인을 끝내지 않는다 (#321).
//
// 두 밤 연속으로 1회차에서 죽었고 둘 다 원인이 같다 — OpenRouter 업스트림 제공자의
// **일시적** 429(`is temporarily rate-limited upstream. Please retry shortly`). 모델이
// 은퇴한 것도, 자격증명이나 네트워크가 끊긴 것도 아니다. 그런데 opencode 가 34초 만에
// 포기하면 파이프라인은 곧바로 salvage 로 가 끝났다 — 유닛에는 3시간이 잡혀 있는데.
//
// 두 번째 문제는 **왜 죽었는지가 보고에 없었다**는 것이다. 출력을 inherit 로 흘려보내
// `e.message` 에는 "Command failed: <명령줄>" 뿐이었고, 실패 이유는 systemd 저널에만
// 남아 아침에 사람이 볼 수 없었다.
//
// 판정만 여기서 시험한다 — 잠자기도 프로세스 실행도 pipeline.mjs 쪽 일이다.
import { describe, it, expect } from 'vitest';
import { retryPlan, failureTail } from '../../../../scripts/ai-team/agent-retry.mjs';

/** 개발자 둘 — 이번 회차 당번이 맨 앞에 오는 목록. */
const 둘 = ['minimax/minimax-m3:free', 'thinkingmachines/inkling:free'];

/**
 * `retryPlan({ attempt, models, maxAttempts })` — 이번 시도에 무엇을 어떻게 부르나.
 *
 * 모델은 목록을 순환하고, 대기는 0 → 30000 → 60000 → … → 300000 에서 멈춘다.
 * 그만둘 때가 됐으면 `null` 을 주고, 그때 호출측이 salvage 로 간다.
 */
describe('retryPlan — 이번 시도에 무엇을 어떻게 부르나', () => {
  it('첫 시도는 첫 모델을 안 기다리고 바로 부른다', () => {
    expect(retryPlan({ attempt: 1, models: 둘 })).toEqual({ model: 둘[0], waitMs: 0 });
  });

  // 첫 시도가 죽었을 때만 여기로 온다 — 회차 교대는 그대로고, 이건 그 위에 얹는 것이다.
  it('둘째 시도는 다음 개발자에게 30초 뒤에 넘긴다', () => {
    expect(retryPlan({ attempt: 2, models: 둘 })).toEqual({ model: 둘[1], waitMs: 30000 });
  });

  // 관리(`[MANAGER_MODEL]`)가 이 경우다. 후보를 늘리지 않고 같은 모델로 다시 두드린다.
  it('모델이 하나뿐이면 둘째 시도도 같은 모델이다 — 대기만 붙는다', () => {
    expect(retryPlan({ attempt: 2, models: ['solo:free'] }))
      .toEqual({ model: 'solo:free', waitMs: 30000 });
  });

  it('모델 수보다 시도가 많아지면 목록 처음으로 돌아온다', () => {
    expect(retryPlan({ attempt: 3, models: 둘 })).toEqual({ model: 둘[0], waitMs: 60000 });
  });

  it('maxAttempts 를 넘는 시도는 없다', () => {
    expect(retryPlan({ attempt: 3, models: 둘, maxAttempts: 3 })).toEqual({ model: 둘[0], waitMs: 60000 });
    expect(retryPlan({ attempt: 4, models: 둘, maxAttempts: 3 })).toBeNull();
  });

  // 상한이 없으면 한 번 막힌 밤이 영영 잠만 잔다.
  it('대기는 300000 에서 멈춘다', () => {
    expect(retryPlan({ attempt: 4, models: 둘, maxAttempts: 9 })?.waitMs).toBe(120000);
    expect(retryPlan({ attempt: 5, models: 둘, maxAttempts: 9 })?.waitMs).toBe(240000);
    expect(retryPlan({ attempt: 6, models: 둘, maxAttempts: 9 })?.waitMs).toBe(300000);
    expect(retryPlan({ attempt: 7, models: 둘, maxAttempts: 9 })?.waitMs).toBe(300000);
  });

  it('부를 모델이 하나도 없으면 null', () => {
    expect(retryPlan({ attempt: 1, models: [] })).toBeNull();
  });

  // 모델 목록은 호출측이 만들어 넘긴다 — `resolveModels` 가 빈 것을 주거나 하나만 줄 수 있다.
  it('models 가 배열이 아니면 null — 문자열 하나를 넘겨도 쪼개 쓰지 않는다', () => {
    expect(retryPlan({ attempt: 1, models: 'minimax/minimax-m3:free' as never })).toBeNull();
    expect(retryPlan({ attempt: 1, models: undefined as never })).toBeNull();
    expect(retryPlan({ attempt: 1 } as never)).toBeNull();
    expect(retryPlan()).toBeNull();
  });

  // attempt 가 0 이면 `models[-1]` 이라 undefined 가 모델 자리에 실린다 — 그렇게 부르면 안 된다.
  it('attempt 는 1부터다 — 0 이나 음수는 null', () => {
    expect(retryPlan({ attempt: 0, models: 둘 })).toBeNull();
    expect(retryPlan({ attempt: -1, models: 둘 })).toBeNull();
  });

  it('attempt 가 정수가 아니면 null', () => {
    expect(retryPlan({ attempt: 1.5, models: 둘 })).toBeNull();
    expect(retryPlan({ attempt: NaN, models: 둘 })).toBeNull();
    expect(retryPlan({ attempt: '1' as never, models: 둘 })).toBeNull();
  });

  it('maxAttempts 를 안 주면 세 번까지다', () => {
    expect(retryPlan({ attempt: 3, models: 둘 })).not.toBeNull();
    expect(retryPlan({ attempt: 4, models: 둘 })).toBeNull();
  });

  it('maxAttempts 가 0 이거나 정수가 아니면 null — 한 번도 안 부른다', () => {
    expect(retryPlan({ attempt: 1, models: 둘, maxAttempts: 0 })).toBeNull();
    expect(retryPlan({ attempt: 1, models: 둘, maxAttempts: -3 })).toBeNull();
    expect(retryPlan({ attempt: 1, models: 둘, maxAttempts: 2.5 })).toBeNull();
  });

  // 클로드는 모델 인자가 없다. `[null]` 을 넘기고 받은 null 을 그대로 무시한다.
  it('models 가 [null] 이어도 model 로 null 을 그대로 준다', () => {
    expect(retryPlan({ attempt: 1, models: [null] })).toEqual({ model: null, waitMs: 0 });
    expect(retryPlan({ attempt: 2, models: [null] })).toEqual({ model: null, waitMs: 30000 });
  });
});

/**
 * `failureTail(chunks, limit)` — 실패한 시도가 뱉은 것을 보고에 실을 한 덩이로.
 *
 * `e.stdout`·`e.stderr`·`e.message` 를 그대로 담아 넘긴다. 실패 이유는 늘 **끝**에 있으므로
 * 넘치면 뒤쪽을 남긴다 — 앞을 남기면 잘려 나가는 것이 바로 그 이유다.
 */
describe('failureTail — 실패 이유를 보고에 싣는다', () => {
  it('짧으면 구분자 없이 이어 그대로 준다 — 생략 표시가 붙지 않는다', () => {
    expect(failureTail(['stdout 조각', 'stderr 조각', 'Command failed'], 4000))
      .toBe('stdout 조각stderr 조각Command failed');
  });

  it('넘치면 뒤쪽만 남기고 앞에 생략 표시를 붙인다', () => {
    const 원문 = `${'앞'.repeat(500)}rate-limited upstream`;
    const out = failureTail([원문], 100);
    expect(out.length).toBe(110);
    expect(out.startsWith('…(앞부분 생략)\n')).toBe(true);
    expect(out.slice(10)).toBe(원문.slice(-100));
    expect(out).toContain('rate-limited upstream');
  });

  it('길이가 정확히 limit 이면 생략 표시가 없다 — 경계에서 안 붙는다', () => {
    const 딱맞음 = '가'.repeat(100);
    expect(failureTail([딱맞음], 100)).toBe(딱맞음);
  });

  // `e.stdout` 은 파이프를 안 쓰면 undefined 고, 코드가 숫자로 실려 오기도 한다.
  it('문자열이 아닌 항목은 건너뛴다', () => {
    expect(failureTail(['가', null, undefined, 3, {}, '나'], 4000)).toBe('가나');
  });

  it('남는 것이 없으면 빈 문자열', () => {
    expect(failureTail([], 4000)).toBe('');
    expect(failureTail([null, undefined, 7], 4000)).toBe('');
  });

  it('chunks 가 배열이 아니면 빈 문자열 — 문자열 하나를 넘겨도 쪼개지 않는다', () => {
    expect(failureTail('통째로 넘긴 것' as never, 4000)).toBe('');
    expect(failureTail(undefined, 4000)).toBe('');
    expect(failureTail()).toBe('');
  });

  it('limit 이 0 이거나 음수면 빈 문자열', () => {
    expect(failureTail(['무엇이든'], 0)).toBe('');
    expect(failureTail(['무엇이든'], -1)).toBe('');
    expect(failureTail(['무엇이든'], 1.5)).toBe('');
  });

  it('limit 을 안 주면 4000자까지다', () => {
    expect(failureTail(['가'.repeat(4000)])).toBe('가'.repeat(4000));
    expect(failureTail(['가'.repeat(4001)]).length).toBe(4010);
  });
});

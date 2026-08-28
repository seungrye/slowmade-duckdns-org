#!/usr/bin/env node
// 에이전트 호출이 한 번 실패했다고 파이프라인을 끝내지 않는다 (#321).
//
// ── 왜 ──────────────────────────────────────────────────────────────────
//
// 두 밤 연속으로 1회차에서 죽었다. 둘 다 원인은 OpenRouter 업스트림 제공자의 **일시적**
// 429 다 — `[GMICloud] minimax/minimax-m3:free is temporarily rate-limited upstream.`
// opencode 가 34초 동안 다섯 번 재시도하고 0 이 아닌 코드로 끝나면 파이프라인은 곧바로
// salvage 로 가 `process.exit(2)` 했다. 유닛에 3시간이 잡혀 있는데 34초 만에 손을 든 셈이다.
//
// 게다가 왜 죽었는지가 보고에 안 실렸다. `stdio` 를 inherit 로 흘려보내서 `e.message` 는
// 노드가 만든 "Command failed: <명령줄>" 뿐이었고, 아침에 사람에게 남는 것은
// "모델·자격증명·네트워크를 먼저 보세요" 라는 **추측**뿐이었다.
//
// 판정만 순수 함수로 둔다 — 잠자기도 프로세스 실행도 pipeline.mjs 쪽이 맡는다.
// 그래야 시험할 수 있다.

/**
 * 이번 시도에 무엇을 어떻게 부를지. 그만둘 때가 됐으면 `null`.
 *
 * 모델은 목록을 **순환**한다 — 개발자가 둘이면 첫 시도가 죽었을 때 둘째가 받는다.
 * 대기는 첫 시도 0, 그다음 30초에서 두 배씩 늘려 300000 에서 멈춘다.
 *
 *     attempt   1       2       3       4        5        6        7
 *     waitMs    0   30000   60000  120000   240000   300000   300000
 *
 * @param {{attempt:number, models:Array<string|null>, maxAttempts?:number}} [입력]
 *   `attempt` 는 1부터 세고, 모델 인자가 없는 에이전트(클로드)는 `models` 로 `[null]` 을 준다
 * @returns {{model:string|null, waitMs:number}|null}
 */
export function retryPlan(입력) {
  throw new Error(`retryPlan: 아직 구현되지 않았습니다 (${typeof 입력})`);
}

/**
 * 실패한 시도가 뱉은 것들을 보고에 실을 한 덩이로.
 *
 * `e.stdout`·`e.stderr`·`e.message` 를 그대로 담아 넘긴다 — 문자열이 아닌 것은 건너뛰고
 * 나머지를 구분자 없이 잇는다. `limit` 을 넘으면 **뒤쪽**만 남긴다. 실패 이유는 늘 끝에 있다.
 *
 * @param {Array<unknown>} [chunks] 실패한 시도의 출력 조각들
 * @param {number} [limit] 남길 글자 수. 기본 4000
 * @returns {string}
 */
export function failureTail(chunks, limit) {
  throw new Error(`failureTail: 아직 구현되지 않았습니다 (${typeof chunks}, ${typeof limit})`);
}

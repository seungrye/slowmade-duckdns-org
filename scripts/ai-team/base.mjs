// 파이프라인 워크트리를 어디서 갈라내나 (#284).
//
// `main` 이 하드코딩돼 있었다. 그래서 어느 브랜치에서 돌리든 워크트리 내용은 main 이고,
// **그 브랜치가 새로 넣은 테스트가 워크트리에 없다.** 실제로 `feat/279-runner-pipeline`
// 에서 파이프라인을 돌려 검증했는데 그 브랜치의 `snapshot.test.ts`(66줄)가 전체 스위트
// 2712건에 안 들어갔다 — 파이프라인이 자기 자신을 검증하지 못한다.
//
// 야간 러너는 **체크아웃된 트리를 그대로 도는 것이 설계**이므로(`ai-team.service:29`),
// 기본값을 HEAD 로 두면 러너도 의도대로 돈다. main 을 못박고 싶으면 `PIPELINE_BASE=main`.
//
// 스크립트(node)와 테스트(vitest)가 같은 파일을 쓴다. 두 벌로 두면 한쪽만 고쳐지는 날이 온다.

/** HEAD 를 못 읽거나 detached 일 때 떨어질 자리. */
const FALLBACK = 'main';

/**
 * 워크트리 기준 ref.
 *
 * `git rev-parse --abbrev-ref HEAD` 는 detached HEAD 에서 문자열 `HEAD` 를 준다. 그대로
 * 넘기면 `git worktree add -b <새브랜치> <경로> HEAD` 가 되어 지금 커밋에서 갈라지는데,
 * 그건 러너가 어디 있는지에 따라 결과가 달라진다는 뜻이라 기준으로 못 쓴다.
 *
 * @param {{envBase?: string, headRef?: string}} 입력
 * @returns {string} `git worktree add` 에 넘길 ref
 */
export function resolveBase({ envBase, headRef } = {}) {
  const env = envBase?.trim();
  if (env) return env;
  const head = headRef?.trim();
  if (!head || head === 'HEAD') return FALLBACK;
  return head;
}

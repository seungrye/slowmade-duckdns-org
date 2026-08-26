// AI 끼리 무한히 주고받는 것을 끊는다 (#268).
//
// #266 이 코더 러너를 넣으면서 **"사람이 있어야 다시 돈다" 는 잠금이 풀렸다.**
// 클로드는 마지막이 `coder` 면 답하고, 코더는 마지막이 `claude` 면 답한다 — 사람이 다시
// 안 와도 매일 둘이 주고받으며 영원히 쌓인다. 그동안 호출 비용이 계속 나간다.
//
// **프롬프트로 막지 않는다.** "N개 넘으면 멈춰라" 를 시키면 모델이 세다가 틀린다. 이
// 저장소의 자율성 잠금은 전부 구조다 — 편집 도구를 안 주고, 쓰기 경로를 덧글 하나로
// 좁혔다. 같은 방식으로 **서버가 끊는다.** 라우트가 거절하면 어느 러너도 못 뚫는다.

/**
 * 사람 없이 AI 가 이어서 말할 수 있는 최대 횟수 — 왕복 다섯 번.
 *
 * 그 이상 오갔는데 결론이 안 났다면 둘이 더 떠들 문제가 아니라 사람이 봐야 할 문제다.
 */
export const AI_PINGPONG_LIMIT = 10;

/** 사람인지만 본다 — 코더든 클로드든 AI 다. */
interface Speaker {
  isBot: boolean;
}

/**
 * 마지막 사람 덧글 이후 AI 가 몇 번 말했나.
 *
 * 사람 덧글이 하나도 없으면 전부 센다 — 글 본문이 사람 차례이므로 그 뒤는 죄다 AI 가
 * 이어 말한 것이다.
 */
export function aiRunLength(comments: readonly Speaker[]): number {
  let n = 0;
  for (let i = comments.length - 1; i >= 0; i--) {
    if (!comments[i].isBot) break;
    n++;
  }
  return n;
}

/**
 * 이제 그만할 때인가.
 *
 * **사람이 한 마디 하면 다시 풀린다** — 셈이 0 으로 돌아가므로 대화가 이어진다.
 * 막는 것은 "사람 없이 계속 도는 것" 이지 대화 자체가 아니다.
 */
export function isAiPingPongExhausted(
  comments: readonly Speaker[],
  limit: number = AI_PINGPONG_LIMIT,
): boolean {
  return aiRunLength(comments) >= limit;
}

/**
 * 앞으로 몇 번 더 말할 수 있나.
 *
 * **러너에게 이 숫자를 알려 준다.** 모르면 하던 말 도중에 갑자기 409 로 잘린다 — 알면
 * 남은 횟수에 맞춰 마무리를 짓고 끝낼 수 있다. 막는 쪽과 알려 주는 쪽이 **같은 함수**를
 * 써야 "한 번 남았다고 했는데 거절당하는" 어긋남이 안 생긴다.
 */
export function aiTurnsLeft(
  comments: readonly Speaker[],
  limit: number = AI_PINGPONG_LIMIT,
): number {
  return Math.max(0, limit - aiRunLength(comments));
}

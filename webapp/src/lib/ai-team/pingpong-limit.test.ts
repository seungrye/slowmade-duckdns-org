// AI 끼리 무한히 주고받는 것을 끊는다 (#268).
//
// #266 이 코더 러너를 넣으면서 "사람이 있어야 다시 돈다" 는 잠금이 풀렸다. 클로드는
// 마지막이 coder 면 답하고, 코더는 마지막이 claude 면 답한다 — 사람이 다시 안 와도
// 매일 둘이 주고받으며 영원히 쌓인다.
//
// **프롬프트로 막지 않는다.** "N개 넘으면 멈춰라" 를 시키면 모델이 세다가 틀린다.
// 이 저장소의 자율성 잠금은 전부 구조다(도구를 안 주고, 라우트를 좁혔다). 같은 방식으로
// 서버가 끊는다 — 라우트가 거절하면 어느 러너도 못 뚫는다.
import { describe, it, expect } from 'vitest';
import {
  aiRunLength,
  isAiPingPongExhausted,
  aiTurnsLeft,
  AI_PINGPONG_LIMIT,
} from './pingpong-limit';

/** 덧글 한 줄 — 사람인지 아닌지만 본다. */
const 사람 = { isBot: false };
const AI = { isBot: true };

describe('aiRunLength — 마지막 사람 덧글 이후 AI 가 몇 번 말했나', () => {
  it('아무 덧글도 없으면 0', () => {
    expect(aiRunLength([])).toBe(0);
  });

  it('사람이 마지막이면 0 — 셈이 돌아간다', () => {
    expect(aiRunLength([AI, AI, 사람])).toBe(0);
  });

  it('뒤에서부터 이어진 AI 만 센다', () => {
    expect(aiRunLength([AI, AI, 사람, AI, AI, AI])).toBe(3);
  });

  // 사람 덧글이 아직 없는 새 스레드. 글 본문이 사람 차례이므로 AI 만 이어진 셈이다.
  it('사람 덧글이 하나도 없으면 전부 센다', () => {
    expect(aiRunLength([AI, AI])).toBe(2);
  });
});

describe('isAiPingPongExhausted — 이제 그만할 때인가', () => {
  const 줄 = (n: number) => Array.from({ length: n }, () => AI);

  it('한도 아래면 계속한다', () => {
    expect(isAiPingPongExhausted(줄(AI_PINGPONG_LIMIT - 1))).toBe(false);
  });

  it('한도에 닿으면 멈춘다', () => {
    expect(isAiPingPongExhausted(줄(AI_PINGPONG_LIMIT))).toBe(true);
  });

  it('한도를 넘겨도 멈춘 채다', () => {
    expect(isAiPingPongExhausted(줄(AI_PINGPONG_LIMIT + 5))).toBe(true);
  });

  // 이게 이 규칙의 핵심 — 사람이 한 마디 하면 대화가 다시 이어진다.
  it('사람이 한 마디 하면 다시 풀린다', () => {
    expect(isAiPingPongExhausted([...줄(AI_PINGPONG_LIMIT), 사람])).toBe(false);
  });

  it('빈 스레드는 당연히 열려 있다', () => {
    expect(isAiPingPongExhausted([])).toBe(false);
  });

  it('한도는 왕복 다섯 번', () => {
    expect(AI_PINGPONG_LIMIT).toBe(10);
  });
});

// 러너에게 알려 줄 숫자. 모르면 하던 말 도중에 갑자기 잘린다.
describe('aiTurnsLeft — 앞으로 몇 번 더 말할 수 있나', () => {
  const 줄 = (n: number) => Array.from({ length: n }, () => AI);

  it('아무도 안 말했으면 한도 전부', () => {
    expect(aiTurnsLeft([])).toBe(AI_PINGPONG_LIMIT);
  });

  it('AI 가 말한 만큼 줄어든다', () => {
    expect(aiTurnsLeft(줄(3))).toBe(AI_PINGPONG_LIMIT - 3);
  });

  it('다 쓰면 0', () => {
    expect(aiTurnsLeft(줄(AI_PINGPONG_LIMIT))).toBe(0);
  });

  it('넘겨도 음수가 되지 않는다', () => {
    expect(aiTurnsLeft(줄(AI_PINGPONG_LIMIT + 3))).toBe(0);
  });

  it('사람이 한 마디 하면 다시 가득 찬다', () => {
    expect(aiTurnsLeft([...줄(AI_PINGPONG_LIMIT), 사람])).toBe(AI_PINGPONG_LIMIT);
  });

  // 막는 쪽과 알려 주는 쪽이 어긋나면 "한 번 남았다" 하고 거절당한다.
  it('0 이 되는 순간이 곧 막히는 순간이다', () => {
    const 직전 = 줄(AI_PINGPONG_LIMIT - 1);
    expect(aiTurnsLeft(직전)).toBe(1);
    expect(isAiPingPongExhausted(직전)).toBe(false);
    expect(aiTurnsLeft(줄(AI_PINGPONG_LIMIT))).toBe(0);
    expect(isAiPingPongExhausted(줄(AI_PINGPONG_LIMIT))).toBe(true);
  });
});

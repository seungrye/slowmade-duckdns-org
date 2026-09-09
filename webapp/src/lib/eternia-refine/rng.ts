// 씨앗 난수 (#430).
//
// `Math.random` 을 쓰면 **실패한 회차를 다시 걷지 못한다.** 지도가 회차마다 달라야 다시 할
// 이유가 생기지만, 같은 씨앗이면 같은 지도가 나와야 시험이 성립한다. 그 둘을 동시에 얻는
// 값이 씨앗이다.
//
// 선형 합동법(LCG)이면 충분하다 — 여기서 뽑는 것은 지도 모양과 보상 카드이지 암호가 아니다.
// `playthrough.test.ts` 가 쓰던 것을 그대로 옮겨 왔다(시험과 실행이 같은 난수를 쓰게).

/** 0 이상 1 미만. 부르는 쪽은 `Math.random` 자리에 그대로 끼우면 된다. */
export type Rng = () => number;

/**
 * 씨앗에서 난수원을 만든다.
 *
 * ```
 * const a = seeded(42), b = seeded(42);
 * a() === b()   // 같은 씨앗은 같은 수열
 * ```
 */
export function seeded(seed: number): Rng {
  let s = Math.abs(Math.trunc(seed)) % 2147483648;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** `[0, n)` 의 정수 하나. */
export function pick(rng: Rng, n: number): number {
  return Math.min(n - 1, Math.floor(rng() * n));
}

/** 배열에서 하나. 빈 배열이면 undefined. */
export function one<T>(rng: Rng, xs: readonly T[]): T | undefined {
  return xs.length === 0 ? undefined : xs[pick(rng, xs.length)];
}

/** 새 회차의 씨앗. 이 한 줄만 비결정적이고 나머지는 전부 씨앗에서 나온다. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2147483648);
}

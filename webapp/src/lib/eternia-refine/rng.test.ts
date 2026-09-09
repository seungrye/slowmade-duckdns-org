// 씨앗 난수 (#445).
//
// 변이 시험이 찾아낸 빈자리다 — `one()` 에 **커버리지가 아예 없었다**. 지도·보상이 전부
// 여기서 나오는데, 이게 늘 첫 원소를 주거나 undefined 를 주어도 아무도 안 잡았다.
//
// 재현성(같은 씨앗 = 같은 회차)은 `?seed=` 손잡이와 e2e 결정성이 통째로 기대는 계약이라
// 여기서 직접 못박는다. `map.test.ts` 가 간접적으로 덮긴 하지만, 깨졌을 때 어디가 문제인지
// 알려 주지는 않는다.

import { describe, it, expect } from 'vitest';
import { seeded, pick, one, newSeed } from './rng';

const take = (rng: () => number, n: number) => Array.from({ length: n }, () => rng());

describe('seeded — 같은 씨앗은 같은 수열', () => {
  it('두 번 만들어도 같다 — 회차를 다시 걸을 수 있다', () => {
    expect(take(seeded(42), 20)).toEqual(take(seeded(42), 20));
  });

  it('다른 씨앗은 다른 수열', () => {
    expect(take(seeded(42), 20)).not.toEqual(take(seeded(43), 20));
  });

  it('언제나 [0, 1)', () => {
    const rng = seeded(7);
    for (const v of take(rng, 500)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('음수·소수 씨앗도 받는다 — 주소창에서 뭐가 들어올지 모른다', () => {
    expect(() => take(seeded(-42.7), 5)).not.toThrow();
    expect(take(seeded(-42.7), 5)).toEqual(take(seeded(-42.7), 5));
  });
});

describe('pick — [0, n) 의 정수', () => {
  it('범위를 벗어나지 않는다 — 배열 밖을 짚으면 undefined 가 새어 나간다', () => {
    const rng = seeded(1);
    for (let i = 0; i < 500; i++) {
      const n = (i % 9) + 1;
      const v = pick(rng, n);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(n);
    }
  });

  it('n 이 1 이면 늘 0', () => {
    expect(pick(seeded(9), 1)).toBe(0);
  });
});

describe('one — 배열에서 하나', () => {
  it('반드시 그 배열의 원소다', () => {
    const xs = ['가', '나', '다', '라'];
    const rng = seeded(3);
    for (let i = 0; i < 200; i++) expect(xs).toContain(one(rng, xs));
  });

  it('첫 원소만 주지 않는다 — 고르는 시늉만 하면 지도가 늘 같아진다', () => {
    const xs = ['가', '나', '다', '라'];
    const rng = seeded(3);
    const got = new Set(Array.from({ length: 200 }, () => one(rng, xs)));
    expect(got.size).toBeGreaterThan(1);
  });

  it('빈 배열이면 undefined', () => {
    expect(one(seeded(1), [])).toBeUndefined();
  });

  it('같은 씨앗이면 같은 선택', () => {
    const xs = [1, 2, 3, 4, 5];
    const a = seeded(11);
    const b = seeded(11);
    expect(Array.from({ length: 20 }, () => one(a, xs))).toEqual(
      Array.from({ length: 20 }, () => one(b, xs)),
    );
  });
});

describe('newSeed — 유일하게 비결정적인 한 줄', () => {
  it('seeded 가 받을 수 있는 값을 준다', () => {
    const s = newSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(take(seeded(s), 3)).toEqual(take(seeded(s), 3));
  });
});

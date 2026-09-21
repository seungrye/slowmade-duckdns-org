// 셔플 백이 정말 균등한가 (#475).
//
// **이 시험이 이 기능의 값어치를 지킨다.** 배정이 치우치면 투표 수가 아무리 쌓여도
// 결론이 안 나온다. 「아홉 번 뽑으면 아홉 개가 정확히 한 번씩」이 그 약속이다.

import { describe, it, expect } from 'vitest';
import { seeded } from './rng';
import { VARIANTS } from './ui-variant';
import { draw, refill, type Bag } from './variant-bag';

/** 백에서 n 번 꺼낸다 — 실제 쓰임(꺼낸 뒤 남은 것을 저장)과 같은 모양. */
function take(n: number, rng = seeded(7), bag: Bag = []) {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = draw(bag, rng);
    out.push(d.variant.id);
    bag = d.rest;
  }
  return { ids: out, bag };
}

describe('균등 — 뽑은 것을 도로 넣지 않는다', () => {
  it('아홉 번 뽑으면 아홉 개가 정확히 한 번씩', () => {
    const { ids } = take(9);
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(9);
    expect([...ids].sort()).toEqual([...VARIANTS.map((v) => v.id)].sort());
  });

  it('열여덟 번이면 각 조합이 정확히 두 번 — 한 바퀴가 끝나면 다시 채운다', () => {
    const { ids } = take(18);
    const count = new Map<string, number>();
    for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1);
    expect([...count.values()]).toEqual(Array(9).fill(2));
  });

  it('첫 아홉과 다음 아홉의 순서가 다르다 — 섞긴 섞는다', () => {
    const { ids } = take(18);
    expect(ids.slice(0, 9)).not.toEqual(ids.slice(9));
  });
});

describe('랜덤 — 순서는 씨앗에서만 나온다', () => {
  it('같은 씨앗이면 같은 순서 (시험이 흔들리지 않게)', () => {
    expect(take(9, seeded(42)).ids).toEqual(take(9, seeded(42)).ids);
  });

  it('씨앗이 다르면 대개 다른 순서', () => {
    expect(take(9, seeded(1)).ids).not.toEqual(take(9, seeded(2)).ids);
  });

  it('refill 은 아홉 개를 다 담는다 — 빠뜨리면 그 조합은 영영 안 나온다', () => {
    const bag = refill(seeded(3));
    expect([...bag].sort()).toEqual([...VARIANTS.map((v) => v.id)].sort());
  });
});

describe('망가진 저장본 — 배정 때문에 회차가 멈추면 안 된다', () => {
  it('빈 백이면 새로 채워 꺼낸다', () => {
    expect(draw([], seeded(1)).variant).toBeDefined();
  });

  it('null·undefined 도 견딘다', () => {
    expect(draw(null, seeded(1)).variant).toBeDefined();
    expect(draw(undefined, seeded(1)).variant).toBeDefined();
  });

  it('모르는 id 는 버린다 — 옛 이름이 남아 있어도 된다', () => {
    const d = draw(['fan:fancy', 'rail:sigil', 'nope'], seeded(1));
    expect(d.variant.id).toBe('rail:sigil');
    expect(d.rest).toEqual([]);
  });

  it('배열이 아니면 새로 채운다', () => {
    // 저장본이 손상된 경우 — 타입 밖의 값이 들어온다.
    const d = draw('fan:plain' as unknown as Bag, seeded(1));
    expect(d.variant).toBeDefined();
    expect(d.rest).toHaveLength(8);
  });

  it('남은 것이 하나뿐이면 그걸 주고 백을 비운다', () => {
    const d = draw(['grid:sigil'], seeded(1));
    expect(d.variant.id).toBe('grid:sigil');
    expect(d.rest).toEqual([]);
  });
});

// 변종 배정 — 셔플 백 (#475). 순수.
//
// **랜덤하되 균등해야 한다.** 매번 독립으로 뽑으면(`one(rng, VARIANTS)`) 아홉 판을 해도
// 어떤 조합은 세 번 나오고 어떤 조합은 한 번도 안 나온다 — 방문자가 적은 사이트에서는
// 그 치우침이 그대로 결론이 된다.
//
// 그래서 **뽑고 나서 도로 넣지 않는다**(비복원 추출). 아홉 장을 섞어 한 장씩 꺼내고,
// 다 떨어지면 다시 섞는다. 순서는 랜덤이면서 아홉 회차마다 아홉 개가 정확히 한 번씩 돈다.
//
// 테트리스·음악 재생기가 쓰는 그 방식이고, 이 저장소에는 이미 `shuffle` 과 `Rng` 가 있다.

import { shuffle } from './combat';
import type { Rng } from './rng';
import { VARIANTS, type Variant } from './ui-variant';

/** 아직 안 쓴 변종 id 들. 이것만 저장하면 균등이 재시작을 넘어 이어진다. */
export type Bag = readonly string[];

export interface Draw {
  variant: Variant;
  /** 이번에 꺼내고 남은 것. 그대로 저장한다. */
  rest: Bag;
}

/** 아홉 장을 섞어 새 백을 만든다. */
export function refill(rng: Rng): Bag {
  return shuffle(VARIANTS.map((v) => v.id), rng);
}

/**
 * 한 장 꺼낸다. 백이 비었거나 망가졌으면 새로 채워서 꺼낸다.
 *
 * ```
 * let bag = [];
 * for (let i = 0; i < 9; i++) ({ variant, rest: bag } = draw(bag, rng));
 * // 아홉 개가 정확히 한 번씩
 * ```
 *
 * 저장본이 손상돼도(모르는 id, 배열 아님) 그냥 다시 채운다 — 배정 때문에 회차가 멈추면 안 된다.
 */
export function draw(bag: Bag | null | undefined, rng: Rng): Draw {
  const known = new Set(VARIANTS.map((v) => v.id));
  const usable = Array.isArray(bag) ? bag.filter((id) => known.has(id)) : [];
  const source = usable.length > 0 ? usable : refill(rng);

  const [head, ...rest] = source;
  const variant = VARIANTS.find((v) => v.id === head)!;
  return { variant, rest };
}

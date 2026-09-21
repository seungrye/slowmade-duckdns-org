// 변종 배정의 영속 (#475) — 부수효과 경계.
//
// 백을 브라우저에 남겨야 **균등이 재시작을 넘어 이어진다.** 안 남기면 새로고침마다
// 백이 새로 채워져 첫 장만 계속 뽑히고, 그게 곧 치우침이다.
//
// `save.ts` 와 같은 원칙 — **실패는 삼킨다.** 배정을 못 읽는다고 게임이 멈추면 안 된다.

import { newSeed, seeded } from './rng';
import { DEFAULT_VARIANT, parseVariant, type Variant } from './ui-variant';
import { draw, type Bag } from './variant-bag';

export const VARIANT_KEY = 'eternia-refine:ui:v1';

interface Stored {
  v: 1;
  /** 지금 회차가 쓰는 변종 id. 이어하기가 같은 조작으로 돌아오게 한다. */
  current: string;
  /** 아직 안 쓴 변종들. */
  bag: string[];
}

function read(): Stored | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(VARIANT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (parsed?.v !== 1 || typeof parsed.current !== 'string') return null;
    return { v: 1, current: parsed.current, bag: Array.isArray(parsed.bag) ? parsed.bag : [] };
  } catch {
    return null;
  }
}

function write(next: Stored): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VARIANT_KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패가 회차를 막지 않는다 */
  }
}

/** 주소에 박힌 변종 — `?ui=rail:sigil`. e2e 와 직접 견줘 보는 길. */
export function pinnedVariant(): Variant | null {
  if (typeof window === 'undefined') return null;
  return parseVariant(new URLSearchParams(window.location.search).get('ui'));
}

/**
 * 지금 회차가 쓰던 변종 — 이어하기·새로고침용. 없으면 기본(지금까지의 동작).
 *
 * **뽑지 않는다.** 뽑는 것은 새 회차를 시작할 때뿐이다([nextVariant]).
 */
export function currentVariant(): Variant {
  return pinnedVariant() ?? parseVariant(read()?.current) ?? DEFAULT_VARIANT;
}

/**
 * 새 회차에 쓸 변종을 뽑고 남은 백을 저장한다.
 *
 * `?ui=` 가 박혀 있으면 그걸 쓰고 **백을 건드리지 않는다** — 직접 견줘 보는 동안
 * 배정의 균등이 망가지면 안 된다.
 */
export function nextVariant(): Variant {
  const pinned = pinnedVariant();
  if (pinned) return pinned;

  const stored = read();
  // 씨앗은 여기 한 줄에서만 비결정적이다 — 백을 섞는 것 말고는 전부 순수하다.
  const { variant, rest } = draw(stored?.bag as Bag | undefined, seeded(newSeed()));
  write({ v: 1, current: variant.id, bag: [...rest] });
  return variant;
}

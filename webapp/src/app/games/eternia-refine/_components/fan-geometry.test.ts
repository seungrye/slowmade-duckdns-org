// 부채 기하 (#419 → #427) — 손패가 몇 장이든, 무엇을 고르든 화면을 넘지 않는다.
//
// Godot 팬 레이아웃(정규화 위치 + 포물선 호 + 이웃 흩어짐)으로 옮기면서 다시 썼다.
// 예전 모델은 회전 피벗이 카드 아래 150px 에 있어 회전이 카드를 옆으로도 밀어냈고,
// 그 항을 안 세서 412px 기기에서 잘렸다. 지금은 피벗이 카드 중심이라 그 항이 없다.
//
// 손패는 5장 고정이 아니다 — 루나는 침식에 비례해 더 뽑는다(카엘·루나면 8장). 그래서
// **장수를 바꿔 가며** 못 박는다. 화면 없이 잴 수 있는 부분이라 여기서 본다.
// 실제로 그렇게 그려지는지는 `e2e/eternia-refine.spec.ts` 가 브라우저에서 본다.

import { describe, it, expect } from 'vitest';
import {
  fanGeometry,
  normalized,
  rotatedHalfWidth,
  CARD_W,
  CARD_H,
  EDGE_PAD,
  HOVER_SCALE,
  MAX_ROTATION_DEG,
  SCATTER_MAX,
} from './FanHand';

/** 카드 i 가 쉬는 자리의 중심 x — FanHand 가 그리는 것과 같은 식. */
function restX(i: number, n: number, gap: number) {
  return normalized(i, n) * ((n - 1) / 2) * gap;
}

/**
 * 어떤 상태에서든 가장 멀리 나가는 지점.
 *
 * 셋 중 최대다 — ① 쉬는 자리의 바깥 카드, ② 이웃이 흩어져 더 밀려난 바깥 카드,
 * ③ 바깥 카드를 골라 커진 경우. 고르는 순간 넘치면 그것도 넘치는 것이다.
 */
function maxHalfExtent(width: number, n: number) {
  const { gap, rotation, scatter } = fanGeometry(width, n);
  const outer = Math.abs(restX(n - 1, n, gap));
  return Math.max(
    outer + rotatedHalfWidth(rotation),
    outer + scatter + rotatedHalfWidth(rotation),
    outer + (CARD_W * HOVER_SCALE) / 2,
  );
}

const WIDTHS = [320, 360, 390, 412, 480, 768];
const COUNTS = [1, 2, 3, 5, 7, 8, 10];

describe('fanGeometry — 어떤 폭·장수에서도 넘치지 않는다', () => {
  for (const w of WIDTHS) {
    for (const n of COUNTS) {
      it(`${w}px / ${n}장`, () => {
        expect(maxHalfExtent(w, n)).toBeLessThanOrEqual(w / 2 - EDGE_PAD + 0.5);
      });
    }
  }
});

describe('겹침', () => {
  it('장수가 늘면 더 겹친다 — 폭이 그대로니 벌릴 자리가 없다', () => {
    expect(fanGeometry(412, 10).gap).toBeLessThan(fanGeometry(412, 5).gap);
  });

  it('카드 폭보다 좁게 겹쳐 장수를 받아낸다', () => {
    expect(fanGeometry(412, 10).gap).toBeLessThan(CARD_W);
  });

  it('한 장이면 부채가 아니다', () => {
    expect(fanGeometry(412, 1)).toMatchObject({ gap: 0, rotation: 0, arc: 0, scatter: 0 });
  });
});

describe('정규화 위치 — 배치의 뿌리', () => {
  it('양 끝이 −1·+1, 가운데가 0', () => {
    expect(normalized(0, 5)).toBe(-1);
    expect(normalized(2, 5)).toBe(0);
    expect(normalized(4, 5)).toBe(1);
  });

  it('짝수 장이면 가운데가 비고 좌우가 대칭이다', () => {
    expect(normalized(1, 4)).toBeCloseTo(-normalized(2, 4));
  });

  it('한 장이면 가운데다 — 0 으로 나누지 않는다', () => {
    expect(normalized(0, 1)).toBe(0);
  });
});

describe('포물선 호 — 가운데가 가장 높다', () => {
  /** FanHand 의 y 식: −arc × (1 − t²). 화면 좌표라 음수가 위다. */
  const y = (i: number, n: number, arc: number) => -arc * (1 - normalized(i, n) ** 2);

  it('가운데가 가장자리보다 arc 만큼 높다', () => {
    const { arc } = fanGeometry(412, 5);
    expect(arc).toBeGreaterThan(0);
    expect(y(2, 5, arc)).toBe(-arc);
    // −0 이 나오므로 toBe(0) 은 실패한다(Object.is).
    expect(y(0, 5, arc)).toBeCloseTo(0);
    expect(y(4, 5, arc)).toBeCloseTo(0);
  });

  it('좌우가 대칭이다', () => {
    const { arc } = fanGeometry(412, 7);
    expect(y(1, 7, arc)).toBeCloseTo(y(5, 7, arc));
  });
});

describe('이웃 흩어짐 — 남는 폭 안에서만', () => {
  it('넓은 화면에서는 제 값을 다 쓴다', () => {
    expect(fanGeometry(768, 5).scatter).toBe(SCATTER_MAX);
  });

  it('손패가 많아도 살아남는다 — 비켜서기가 가장 필요한 자리다', () => {
    // 남는 폭으로만 주던 때는 여기서 0 이 됐다. 자리를 먼저 떼어 두어 고쳤다.
    // 자리를 정확히 떼어 쓴 경우라 부동소수 오차가 남는다(19.999…).
    expect(fanGeometry(412, 8).scatter).toBeCloseTo(SCATTER_MAX);
    expect(fanGeometry(360, 8).scatter).toBeCloseTo(SCATTER_MAX);
  });

  it('그럴 자리도 없으면 0 까지 줄어든다 — 부채를 자르느니 안 비킨다', () => {
    expect(fanGeometry(260, 10).scatter).toBe(0);
  });

  it('음수가 되지 않는다', () => {
    for (const w of WIDTHS) {
      for (const n of COUNTS) {
        expect(fanGeometry(w, n).scatter).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('세로 — 회전이 카드를 끌어내리는 만큼 상자가 커진다', () => {
  it('상자 높이 = 카드 + 내려간 양 + 호', () => {
    const g = fanGeometry(412, 8);
    expect(g.height).toBe(CARD_H + g.drop + g.arc);
  });

  it('한 장이면 내려갈 것도 호도 없다', () => {
    const g = fanGeometry(412, 1);
    expect(g.drop).toBe(0);
    expect(g.height).toBe(CARD_H);
  });

  it('중심 회전이라 예전 피벗 모델보다 훨씬 덜 내려간다', () => {
    // 옛 모델: 피벗이 카드 아래 150px → (CARD_W/2)·sinθ + 78·(1−cosθ).
    // 지금: 카드 자신의 AABB 가 커지는 만큼뿐이라 한 자릿수로 떨어진다.
    expect(fanGeometry(412, 8).drop).toBeLessThan(20);
  });
});

describe('각도', () => {
  it('넓은 화면에서는 최대 각도까지 편다', () => {
    expect(fanGeometry(768, 5).rotation).toBe(MAX_ROTATION_DEG);
  });

  it('아주 좁은 화면에서는 각도를 줄여서라도 맞춘다', () => {
    expect(fanGeometry(260, 10).rotation).toBeLessThan(MAX_ROTATION_DEG);
  });
});

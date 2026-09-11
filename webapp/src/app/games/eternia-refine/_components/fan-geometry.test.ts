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
  // 카드 크기는 좁은 화면에서 줄어든다 (#459) — 그만큼 실제로 덜 나간다.
  const { gap, rotation, scatter, scale } = fanGeometry(width, n);
  const outer = Math.abs(restX(n - 1, n, gap));
  return Math.max(
    outer + rotatedHalfWidth(rotation) * scale,
    outer + scatter + rotatedHalfWidth(rotation) * scale,
    outer + (CARD_W * scale * HOVER_SCALE) / 2,
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
    for (const w of SWEEP) {
      for (const n of TIMES) {
        expect(fanGeometry(w, n).scatter).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('세로 — 회전이 카드를 끌어내리는 만큼 상자가 커진다', () => {
  it('상자 높이 = 카드 + 내려간 양 + 호', () => {
    const g = fanGeometry(412, 8);
    expect(g.height).toBe(CARD_H * g.scale + g.drop + g.arc);
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

describe('넓은 화면에서는 이름이 드러난다 (#443)', () => {
  // 카드 폭이 100 이라 간격 40 이면 이웃이 60% 를 가린다 — 실측에서 「달의 각인」이
  // "달의 각" 으로 보였다. 잘린 것이 아니라 **가려진** 것이라 글자 크기로는 못 고친다.
  it('자리가 남으면 이웃이 가리는 폭이 카드의 절반 아래다', () => {
    const { gap } = fanGeometry(1000, 5);
    expect(CARD_W - gap).toBeLessThan(CARD_W / 2);
  });

  it('좁은 화면은 그대로 — 폭이 정하지 상한이 정하지 않는다', () => {
    // 412px 에 8장이면 상한이 아니라 [fit] 의 폭 계산이 간격을 정한다.
    expect(fanGeometry(412, 8).gap).toBeLessThan(40);
  });

  it('넓어진 뒤에도 부채는 화면 안에 있다', () => {
    for (const w of [412, 768, 1000, 1400]) {
      const { gap, rotation, scatter } = fanGeometry(w, 5);
      const outer = Math.abs(restX(4, 5, gap)) + rotatedHalfWidth(rotation) + scatter;
      expect(outer, `width ${w}`).toBeLessThanOrEqual(w / 2);
    }
  });
});

// 좁은 화면에서 더미가 되던 것 (#459).
//
// 제보: "카드가 부채가 아니고 겹쳐있어". 재 보니 회전이 어느 폭에서도 12° 로 고정이고
// 좁아질수록 간격만 깎였다 — 320px·5장에서 67%, 300px·6장에서 78% 가 가려졌다.
//
// 여기서 지키는 것은 **"각 카드가 이만큼은 보인다"** 하나다. 그걸 어떻게 얻는지(각도를
// 줄이든 카드를 줄이든)는 구현이 정하게 둔다 — 값을 베껴 적으면 구현을 못 고친다.

/** 카드가 이 비율보다 더 가려지면 이름이 안 읽혀 부채로 안 보인다. */
const MIN_VISIBLE_RATIO = 0.45;
/** 부동소수점 허용치. 목표를 딱 맞추면 0.44999999999999996 이 나온다. */
const EPS = 1e-9;

/**
 * 실제로 쓰이는 폰 폭부터 판까지. 320px 이 하한이다 — 그보다 좁으면 카드 7~8장을 읽을
 * 만한 크기로 늘어놓는 것이 물리적으로 안 된다(아래 '아주 좁은 화면' 참고).
 */
const SWEEP = [320, 340, 360, 380, 412, 480, 560, 672];
const TIMES = [2, 3, 4, 5, 6, 7, 8];

describe('부채는 어느 폭에서도 부채다 (#459)', () => {
  it('카드가 절반 넘게 가려지지 않는다', () => {
    for (const w of SWEEP) {
      for (const n of TIMES) {
        const g = fanGeometry(w, n);
        const cardW = CARD_W * g.scale;
        expect(g.gap / cardW, `w=${w} n=${n} (gap ${g.gap.toFixed(1)} / card ${cardW.toFixed(1)})`)
          .toBeGreaterThanOrEqual(MIN_VISIBLE_RATIO - EPS);
      }
    }
  });

  // #459 에서는 "좁아지면 회전을 먼저 내놓는다"를 걸었다. 그게 틀렸다 — 회전을 버리니
  // 카드가 그냥 서서 부채가 아니게 됐다(#467). 이제는 **크기를 먼저 내놓는다.**
  it('좁아지면 카드를 먼저 줄인다 — 회전은 부채의 정체다', () => {
    const narrow = fanGeometry(300, 6);
    const wide = fanGeometry(672, 6);
    expect(narrow.scale).toBeLessThan(wide.scale);
    expect(narrow.rotation).toBe(wide.rotation);
  });

  it('넓은 화면에서는 예전 그대로다 — 좁을 때만 양보한다', () => {
    const g = fanGeometry(672, 5);
    expect(g.scale).toBe(1);
    expect(g.rotation).toBe(MAX_ROTATION_DEG);
  });

  it('카드를 줄이더라도 알아볼 만큼은 남긴다', () => {
    for (const w of SWEEP) {
      for (const n of TIMES) {
        expect(fanGeometry(w, n).scale, `w=${w} n=${n}`).toBeGreaterThan(0.6);
        expect(fanGeometry(w, n).scale).toBeLessThanOrEqual(1);
      }
    }
  });

  it('넓어질수록 나빠지지 않는다 — 폭을 늘렸는데 더 가려지면 안 된다', () => {
    for (const n of TIMES) {
      for (let i = 1; i < SWEEP.length; i++) {
        const a = fanGeometry(SWEEP[i - 1], n);
        const b = fanGeometry(SWEEP[i], n);
        const ratio = (g: typeof a) => g.gap / (CARD_W * g.scale);
        expect(ratio(b), `n=${n} ${SWEEP[i - 1]}→${SWEEP[i]}`)
          .toBeGreaterThanOrEqual(ratio(a) - 0.001);
      }
    }
  });

  it('줄인 카드도 화면 안에 있다', () => {
    for (const w of SWEEP) {
      for (const n of TIMES) {
        const g = fanGeometry(w, n);
        const outer = Math.abs(restX(n - 1, n, g.gap))
          + rotatedHalfWidth(g.rotation) * g.scale
          + g.scatter;
        expect(outer, `w=${w} n=${n}`).toBeLessThanOrEqual(w / 2 + 0.001);
      }
    }
  });
});

describe('아주 좁은 화면 — 되는 만큼은 한다 (#459)', () => {
  // 280px 에 8장은 물리적으로 안 된다. 그래도 예전(78% 가림)보다는 나아야 하고, 화면
  // 밖으로 나가면 안 된다. 목표를 못 채울 때 어떻게 무너지는지를 적어 둔다.
  it('목표는 못 채워도 예전보다 낫다', () => {
    for (const n of [7, 8, 10]) {
      const g = fanGeometry(280, n);
      expect(g.gap / (CARD_W * g.scale), `n=${n}`).toBeGreaterThan(0.3);
    }
  });

  it('그래도 화면 밖으로는 안 나간다', () => {
    for (const n of [7, 8, 10]) {
      expect(maxHalfExtent(280, n), `n=${n}`).toBeLessThanOrEqual(280 / 2 - EDGE_PAD + 0.5);
    }
  });
});

// 카드가 안 눕던 것 (#467).
//
// 제보: "이거는 그냥 세워둔거잖아, 앵커가 없는데?" — 340px 이하에서 회전이 0 이라 부채가
// 아니라 계단으로 보였다.
//
// #459 에서 내가 순서를 잘못 잡았다. "회전 → 크기 → 흩어짐" 으로 양보하게 했는데, 회전이
// 폭을 많이 먹으니 먼저 내놓는 게 싸다고 본 것이다. 그런데 **회전이야말로 부채를 부채로
// 만드는 것**이다. 먼저 버리면 목표를 이루려다 목표를 잃는다.
describe('카드는 눕는다 — 부채의 정체 (#467)', () => {
  /** 흔한 손패 크기. 이 범위에서는 어떤 폭이든 부채로 보여야 한다. */
  const COMMON = [3, 4, 5, 6];

  it('흔한 손패에서는 어느 폭에서도 카드가 눕는다', () => {
    for (const w of SWEEP) {
      for (const n of COMMON) {
        // 각도 **값**을 적지 않는다 — 각도를 조정해도 "눕는다"는 성질은 남아야 한다.
        expect(fanGeometry(w, n).rotation, `w=${w} n=${n}`).toBeGreaterThan(0);
      }
    }
  });

  it('좁은 폰에서도 눕는다 — 제보가 나온 자리', () => {
    for (const w of [288, 300, 320, 340]) {
      expect(fanGeometry(w, 5).rotation, `w=${w}`).toBeGreaterThan(0);
    }
  });

  it('넓으면 최대 각도 그대로', () => {
    expect(fanGeometry(672, 5).rotation).toBe(MAX_ROTATION_DEG);
    expect(fanGeometry(672, 5).scale).toBe(1);
  });

  it('회전을 지키느라 카드가 작아지는 것은 받아들인다 — 다만 읽을 만큼은 남긴다', () => {
    for (const w of [288, 320]) {
      const g = fanGeometry(w, 5);
      expect(g.scale, `w=${w}`).toBeLessThan(1);
      expect(g.scale, `w=${w}`).toBeGreaterThan(0.6);
    }
  });
});

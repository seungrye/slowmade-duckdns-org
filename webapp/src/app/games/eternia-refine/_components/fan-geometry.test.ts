// 부채 기하 (#419) — 손패가 몇 장이든 화면을 넘지 않는다.
//
// 처음엔 간격·각도를 상수로 두었다가 412px 기기에서 좌우로 잘렸다. 회전 피벗이 카드
// 아래에 있어 회전이 카드를 옆으로도 밀어내는데 그 항을 안 셌기 때문이다.
//
// 손패는 5장 고정이 아니다 — 루나는 침식에 비례해 더 뽑는다(카엘·루나면 8장). 그래서
// **장수를 바꿔 가며** 넘치지 않는지를 못 박는다. 화면 없이 잴 수 있는 부분이라 여기서 본다.

import { describe, it, expect } from 'vitest';
import { fanGeometry } from './FanHand';

const CARD_W = 100;
const CARD_H = 144;
const PIVOT_BELOW = 150;
const EDGE_PAD = 10;
const rad = (d: number) => (d * Math.PI) / 180;

/** 가장 바깥 카드가 중심에서 얼마나 벗어나나 — FanHand 가 그리는 것과 같은 계산. */
function halfExtent(width: number, n: number) {
  const { spread, gap } = fanGeometry(width, n);
  const maxOffset = (n - 1) / 2;
  const rot = rad(spread * maxOffset);
  const halfRotated = (CARD_W * Math.cos(rot) + CARD_H * Math.sin(rot)) / 2;
  return maxOffset * gap + PIVOT_BELOW * Math.sin(rot) + halfRotated;
}

const WIDTHS = [320, 360, 390, 412, 480, 768];
const COUNTS = [1, 2, 3, 5, 7, 8, 10];

describe('fanGeometry — 어떤 폭·장수에서도 넘치지 않는다', () => {
  for (const w of WIDTHS) {
    for (const n of COUNTS) {
      it(`${w}px / ${n}장`, () => {
        expect(halfExtent(w, n)).toBeLessThanOrEqual(w / 2 - EDGE_PAD + 0.5);
      });
    }
  }
});

describe('겹침', () => {
  it('장수가 늘면 더 겹친다 — 폭이 그대로니 벌릴 자리가 없다', () => {
    const five = fanGeometry(412, 5).gap;
    const ten = fanGeometry(412, 10).gap;
    expect(ten).toBeLessThan(five);
  });

  it('카드 폭보다 좁게 겹쳐 장수를 받아낸다', () => {
    expect(fanGeometry(412, 10).gap).toBeLessThan(CARD_W);
  });

  it('한 장이면 부채가 아니다', () => {
    expect(fanGeometry(412, 1)).toMatchObject({ spread: 0, gap: 0 });
  });
});

describe('세로 — 회전이 카드를 끌어내리는 만큼 상자가 커진다', () => {
  it('눕을수록 더 내려가고, 상자 높이가 그만큼 늘어난다', () => {
    const g = fanGeometry(412, 8);
    expect(g.drop).toBeGreaterThan(0);
    expect(g.height).toBe(CARD_H + g.drop);
  });

  it('한 장이면 내려갈 것이 없다', () => {
    expect(fanGeometry(412, 1).drop).toBe(0);
  });
});

// 지도 좌표 (#457) — **가로로는 절대 넘치지 않는다.**
//
// 제보: 모바일에서 지도에 가로 스크롤이 생긴다. 원인은 SVG 폭을 노드 좌표로만 계산하고
// label 너비를 안 센 것이었다 — 맨 오른쪽 label 이 폭 밖으로 나갔다.
//
// 세로 스크롤은 정상이다. 층이 많으면 넘치는 게 맞고, 화면에 우겨넣으면 노드가 안 읽힌다.

import { describe, it, expect } from 'vitest';
import { mapGeometry, labelChars, clipLabel } from './map-geometry';

const PHONE = 412;
/** 부동소수점 오차 허용치. 화면은 0.00000000006px 를 구분하지 못한다. */
const EPS = 0.01;
const DESKTOP = 672;

describe('mapGeometry — 가로는 폭 안에 들어온다', () => {
  it('맨 바깥 label 이 폭을 안 넘는다', () => {
    for (const w of [320, PHONE, 480, DESKTOP, 1024]) {
      for (const maxWide of [1, 2, 3, 4, 6]) {
        const g = mapGeometry(w, 4, maxWide);
        const rightmost = g.pad + (maxWide - 1) * g.colGap;
        expect(rightmost + g.labelWidth / 2, `w=${w} maxWide=${maxWide}`).toBeLessThanOrEqual(w + EPS);
        expect(g.pad - g.labelWidth / 2, `왼쪽 w=${w}`).toBeGreaterThanOrEqual(-EPS);
      }
    }
  });

  it('SVG 폭이 컨테이너 폭과 같다 — 넘칠 여지가 없다', () => {
    expect(mapGeometry(PHONE, 4, 3).width).toBe(PHONE);
    expect(mapGeometry(DESKTOP, 6, 4).width).toBe(DESKTOP);
  });

  it('칸이 하나면 가운데 선다', () => {
    const g = mapGeometry(PHONE, 3, 1);
    expect(g.pad).toBeCloseTo(PHONE / 2);
  });

  // 상한 **값**을 적지 않는다. 220 이라고 베껴 적으면 상수만 바꿔도 깨지는데 동작은 멀쩡하다.
  // 지켜야 할 것은 "어느 폭부터는 더 안 벌어진다"는 성질이다.
  it('넓어져도 무한정 벌어지지 않는다 — 데스크톱에서 지도가 흩어지지 않게', () => {
    expect(mapGeometry(3200, 4, 3).colGap).toBe(mapGeometry(1600, 4, 3).colGap);
  });

  it('상한에 걸리면 남는 폭은 양옆으로 간다 — 가운데 정렬', () => {
    const g = mapGeometry(3200, 4, 3);
    expect(g.pad).toBeCloseTo((3200 - 2 * g.colGap) / 2);
  });

  it('좁아지면 칸도 같이 좁아진다', () => {
    expect(mapGeometry(320, 4, 3).colGap).toBeLessThan(mapGeometry(640, 4, 3).colGap);
  });
});

describe('mapGeometry — 세로는 스크롤한다', () => {
  it('층이 많으면 높이가 는다 — 줄이지 않는다', () => {
    const a = mapGeometry(PHONE, 4, 3).height;
    const b = mapGeometry(PHONE, 8, 3).height;
    expect(b).toBeGreaterThan(a);
  });

  it('층 간격은 폭과 무관하다', () => {
    expect(mapGeometry(320, 6, 3).height).toBe(mapGeometry(1024, 6, 3).height);
  });
});

describe('labelChars — 칸 폭에 맞춰 자른다', () => {
  it('칸이 좁으면 적게', () => {
    expect(labelChars(80)).toBeLessThan(labelChars(160));
  });

  // 하한 **값**을 적지 않는다. 지켜야 할 것은 "이름이 통째로 사라지지 않는다"이다.
  it('아무리 좁아도 글자가 남는다 — 빈 이름은 길을 못 고르게 만든다', () => {
    for (const w of [0, 1, 10, 40]) expect(labelChars(w), `labelWidth=${w}`).toBeGreaterThan(0);
  });
});

describe('clipLabel', () => {
  it('칸에 들어가면 그대로 둔다', () => {
    expect(clipLabel('정거장', 200)).toBe('정거장');
  });

  it('넘치면 자르되 잘렸다는 것을 보여준다', () => {
    const out = clipLabel('옴팔로스 정거장 잠입', 60);
    expect(out.length).toBeLessThan('옴팔로스 정거장 잠입'.length);
    expect(out.endsWith('…')).toBe(true);
  });

  it('자른 뒤에도 칸 폭 안에 있다 — 자르는 이유가 그것이다', () => {
    for (const w of [40, 60, 100, 160]) {
      expect(clipLabel('아주아주아주긴이름의노드입니다', w).length,
        `labelWidth=${w}`).toBeLessThanOrEqual(labelChars(w));
    }
  });
});

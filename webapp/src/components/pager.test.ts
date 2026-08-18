// 페이징 계산 (#184).
//
// 화면 없이 검증할 수 있게 계산만 떼어 놓았다. 페이징에서 사고가 나는 자리는 거의 언제나
// **경계**다 — 0건, 정확히 나누어떨어질 때, 마지막 페이지, 범위를 벗어난 page 값.
import { describe, it, expect } from 'vitest';
import { clampPage, pageCount, pageOfIndex, pageSlice } from './pager';

describe('pageCount', () => {
  it('나누어떨어지지 않으면 올림', () => {
    expect(pageCount(51, 25)).toBe(3);
    expect(pageCount(26, 25)).toBe(2);
  });

  it('정확히 나누어떨어지면 딱 그만큼 — 빈 페이지를 만들지 않는다', () => {
    expect(pageCount(50, 25)).toBe(2);
    expect(pageCount(25, 25)).toBe(1);
  });

  it('0건이어도 1페이지 — "0 / 0" 같은 표시가 나오지 않게', () => {
    expect(pageCount(0, 25)).toBe(1);
  });

  it('size 가 이상해도 터지지 않는다', () => {
    expect(pageCount(10, 0)).toBe(1);
    expect(pageCount(10, -5)).toBe(1);
  });
});

describe('clampPage', () => {
  it('범위 안이면 그대로', () => {
    expect(clampPage(1, 51, 25)).toBe(1);
  });

  // 자료가 줄어들면(필터 변경 등) 들고 있던 page 가 범위를 벗어난다. 그때 빈 표가 뜨면 안 된다.
  it('마지막 페이지를 넘어가면 마지막으로 당긴다', () => {
    expect(clampPage(9, 51, 25)).toBe(2);
    expect(clampPage(3, 0, 25)).toBe(0);
  });

  it('음수는 0 으로', () => {
    expect(clampPage(-1, 51, 25)).toBe(0);
  });
});

describe('pageSlice', () => {
  const items = Array.from({ length: 51 }, (_, i) => i);

  it('페이지만큼 잘라 준다', () => {
    expect(pageSlice(items, 0, 25)).toEqual(items.slice(0, 25));
    expect(pageSlice(items, 1, 25)).toEqual(items.slice(25, 50));
  });

  it('마지막 페이지는 남은 만큼만', () => {
    expect(pageSlice(items, 2, 25)).toEqual([50]);
  });

  it('범위를 벗어난 page 를 줘도 빈 배열이 아니라 마지막 페이지', () => {
    expect(pageSlice(items, 99, 25)).toEqual([50]);
  });

  it('원본을 건드리지 않는다', () => {
    const copy = [...items];
    pageSlice(items, 1, 25);
    expect(items).toEqual(copy);
  });

  it('빈 목록은 빈 배열', () => {
    expect(pageSlice([], 0, 25)).toEqual([]);
  });
});

describe('pageOfIndex', () => {
  // 마커로 들어온 날짜가 든 페이지를 여는 데 쓴다.
  it('경계에서 정확하다', () => {
    expect(pageOfIndex(0, 25)).toBe(0);
    expect(pageOfIndex(24, 25)).toBe(0);
    expect(pageOfIndex(25, 25)).toBe(1);
    expect(pageOfIndex(49, 25)).toBe(1);
    expect(pageOfIndex(50, 25)).toBe(2);
  });

  it('못 찾았을 때(-1)는 첫 페이지', () => {
    expect(pageOfIndex(-1, 25)).toBe(0);
  });
});

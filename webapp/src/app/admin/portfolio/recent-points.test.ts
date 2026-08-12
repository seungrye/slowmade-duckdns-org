// #95 — 모바일에서 매매 차트를 최근 N 일로 자른다.
import { describe, it, expect } from 'vitest';
import { recentPoints, MOBILE_CHART_DAYS, DESKTOP_CHART_DAYS } from './recent-points';

const pts = (n: number) => Array.from({ length: n }, (_, i) => ({ dateStr: `d${i}` }));

describe('recentPoints', () => {
  it('데스크톱은 최근 3 개월(90 일)만', () => {
    const out = recentPoints(pts(200), false);
    expect(out).toHaveLength(DESKTOP_CHART_DAYS);
    expect(out[out.length - 1].dateStr).toBe('d199');
  });

  // 참조가 바뀌면 useMemo 가 헛돈다 — 자를 것이 없으면 받은 배열을 그대로 돌려준다.
  it('90 일 이하면 데스크톱에서 그대로(같은 참조)', () => {
    const all = pts(50);
    expect(recentPoints(all, false)).toBe(all);
  });

  it('모바일이면 마지막 N 개만 남긴다', () => {
    const out = recentPoints(pts(100), true);
    expect(out).toHaveLength(MOBILE_CHART_DAYS);
    expect(out[out.length - 1].dateStr).toBe('d99'); // 최신이 끝에 오도록
    expect(out[0].dateStr).toBe(`d${100 - MOBILE_CHART_DAYS}`);
  });

  it('30 개 이하면 모바일에서 그대로(같은 참조)', () => {
    const few = pts(10);
    expect(recentPoints(few, true)).toBe(few);
  });

  it('모바일이 데스크톱보다 짧다', () => {
    expect(MOBILE_CHART_DAYS).toBeLessThan(DESKTOP_CHART_DAYS);
  });

  it('빈 배열도 안전하다', () => {
    expect(recentPoints([], true)).toEqual([]);
  });

  it('days 를 직접 줄 수 있다', () => {
    expect(recentPoints(pts(50), true, 7)).toHaveLength(7);
  });
});

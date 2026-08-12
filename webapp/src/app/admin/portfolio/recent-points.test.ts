// #95 — 모바일에서 매매 차트를 최근 N 일로 자른다.
import { describe, it, expect } from 'vitest';
import { recentPoints, MOBILE_CHART_DAYS } from './recent-points';

const pts = (n: number) => Array.from({ length: n }, (_, i) => ({ dateStr: `d${i}` }));

describe('recentPoints', () => {
  it('데스크톱이면 자르지 않는다', () => {
    const all = pts(100);
    expect(recentPoints(all, false)).toBe(all); // 같은 참조 — 불필요한 재계산 방지
  });

  it('모바일이면 마지막 N 개만 남긴다', () => {
    const out = recentPoints(pts(100), true);
    expect(out).toHaveLength(MOBILE_CHART_DAYS);
    expect(out[out.length - 1].dateStr).toBe('d99'); // 최신이 끝에 오도록
    expect(out[0].dateStr).toBe(`d${100 - MOBILE_CHART_DAYS}`);
  });

  it('N 개 이하면 모바일이어도 그대로', () => {
    const few = pts(10);
    expect(recentPoints(few, true)).toBe(few);
  });

  it('빈 배열도 안전하다', () => {
    expect(recentPoints([], true)).toEqual([]);
  });

  it('days 를 직접 줄 수 있다', () => {
    expect(recentPoints(pts(50), true, 7)).toHaveLength(7);
  });
});

// #95 - viewing the trade chart over the last N days on mobile.
// #129 - measured **by date**. Counting points makes 30 points six weeks in snapshots that accumulate on trading days only.
// #133 - **nothing is trimmed.** All the data stays and only the initially visible window is set.
import { describe, it, expect } from 'vitest';
import {
  windowAround,
  windowStartDate,
  windowDays,
  MOBILE_CHART_DAYS,
  DESKTOP_CHART_DAYS,
} from './recent-points';

/** An array of dates, one a day, ending at base. */
function daily(n: number, base = '2026-08-12'): string[] {
  const end = new Date(`${base}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

/** An array of dates excluding weekends (trading days only) - how real snapshots accumulate. */
function tradingDays(n: number, base = '2026-08-12'): string[] {
  const out: string[] = [];
  const d = new Date(`${base}T00:00:00Z`);
  while (out.length < n) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

/** The calendar days from the start date to the last. */
const spanFrom = (start: string, dates: string[]) =>
  Math.round((Date.parse(dates[dates.length - 1]) - Date.parse(start)) / 86_400_000) + 1;

describe('windowDays', () => {
  it('모바일이 데스크톱보다 짧다', () => {
    expect(MOBILE_CHART_DAYS).toBeLessThan(DESKTOP_CHART_DAYS);
    expect(windowDays(true)).toBe(MOBILE_CHART_DAYS);
    expect(windowDays(false)).toBe(DESKTOP_CHART_DAYS);
    expect(windowDays(true, 7)).toBe(7);
  });
});

describe('windowStartDate', () => {
  it('모바일은 마지막 날부터 딱 한 달 창', () => {
    const dates = daily(100);
    expect(spanFrom(windowStartDate(dates, true)!, dates)).toBe(MOBILE_CHART_DAYS);
  });

  it('데스크톱은 3 개월 창', () => {
    const dates = daily(200);
    expect(spanFrom(windowStartDate(dates, false)!, dates)).toBe(DESKTOP_CHART_DAYS);
  });

  // The heart of #129 - back when it counted points, this was 41 days.
  it('거래일만 쌓인 데이터도 **달력 기준**으로 한 달', () => {
    const dates = tradingDays(33); // in production it really was 33 points across 45 days
    expect(spanFrom(dates[0], dates)).toBeGreaterThan(MOBILE_CHART_DAYS);
    expect(spanFrom(windowStartDate(dates, true)!, dates)).toBe(MOBILE_CHART_DAYS);
  });

  // #133 - since the data is not trimmed, the older range outside the window remains and can be reached by dragging.
  it('창 시작일이 데이터의 첫 날보다 뒤다 — 이전 기간이 남아 있다는 뜻', () => {
    const dates = daily(100);
    expect(Date.parse(windowStartDate(dates, true)!)).toBeGreaterThan(Date.parse(dates[0]));
  });

  it('데이터가 이미 창 안이면 undefined — 굳이 창을 잡지 않는다', () => {
    expect(windowStartDate(daily(10), true)).toBeUndefined();
    expect(windowStartDate(daily(50), false)).toBeUndefined();
  });

  it('기준은 오늘이 아니라 **데이터의 마지막 날**이다 — 며칠 쉰 뒤에도 창이 비지 않는다', () => {
    const stale = daily(40, '2025-01-31');
    const start = windowStartDate(stale, true)!;
    expect(spanFrom(start, stale)).toBe(MOBILE_CHART_DAYS);
    expect(start.startsWith('2025-01')).toBe(true);
  });

  it('빈 배열도 안전하다', () => {
    expect(windowStartDate([], true)).toBeUndefined();
  });

  it('날짜를 읽을 수 없으면 창을 잡지 않는다 — 잘못 잡아 감추느니 다 보여 준다', () => {
    expect(windowStartDate(['nope', 'also-nope'], true)).toBeUndefined();
  });

  it('days 를 직접 줄 수 있다', () => {
    const dates = daily(50);
    expect(spanFrom(windowStartDate(dates, true, 7)!, dates)).toBe(7);
  });
});

// #135 - arriving at the symbol detail through a trade marker. That date is visible and the window length is unchanged.
describe('windowAround', () => {
  const lenOf = (w: { startValue: string; endValue: string }) =>
    Math.round((Date.parse(w.endValue) - Date.parse(w.startValue)) / 86_400_000) + 1;
  const contains = (w: { startValue: string; endValue: string }, d: string) =>
    Date.parse(w.startValue) <= Date.parse(d) && Date.parse(d) <= Date.parse(w.endValue);

  it('가운데 날짜를 품고 길이는 한 달', () => {
    const dates = daily(200);
    const w = windowAround(dates, '2026-06-01', true)!;
    expect(contains(w, '2026-06-01')).toBe(true);
    expect(lenOf(w)).toBe(MOBILE_CHART_DAYS);
  });

  it('데스크톱은 3 개월', () => {
    const dates = daily(300);
    expect(lenOf(windowAround(dates, '2026-05-01', false)!)).toBe(DESKTOP_CHART_DAYS);
  });

  it('마지막 날 근처면 **길이를 지킨 채** 안으로 민다 — 절반이 비지 않게', () => {
    const dates = daily(200);
    const w = windowAround(dates, dates[dates.length - 1], true)!;
    expect(w.endValue).toBe(dates[dates.length - 1]);
    expect(lenOf(w)).toBe(MOBILE_CHART_DAYS);
  });

  it('첫 날 근처도 마찬가지', () => {
    const dates = daily(200);
    const w = windowAround(dates, dates[0], true)!;
    expect(w.startValue).toBe(dates[0]);
    expect(lenOf(w)).toBe(MOBILE_CHART_DAYS);
  });

  it('데이터가 창보다 짧으면 데이터 전체', () => {
    const dates = daily(10);
    const w = windowAround(dates, dates[5], true)!;
    expect(w.startValue).toBe(dates[0]);
    expect(w.endValue).toBe(dates[dates.length - 1]);
  });

  it('center 를 못 읽으면 undefined — 호출측이 최근 창으로 돌아간다', () => {
    expect(windowAround(daily(50), 'nope', true)).toBeUndefined();
    expect(windowAround([], '2026-08-01', true)).toBeUndefined();
  });
});

/**
 * The window's boundaries must be **dates that actually exist on the axis** (#370).
 *
 * `startValue` is computed as a calendar date (the last day minus 29), while the x-axis categories are **trading
 * days** only. If that day is a weekend or holiday it is a value absent from the axis, and ECharts ignores a value
 * it cannot find on a category axis - so **the window is never applied and everything shows.**
 *
 * The main chart (/admin/portfolio) has only 46 days of snapshots, so it usually short-circuits as "already inside
 * the window" and never took this path. It only surfaced on the trade detail, which draws years of daily bars.
 */
describe("창 경계는 축에 있는 날짜여야 한다 (#370)", () => {
  // Trading days only, weekends excluded - the same shape as real daily bars.
  const 거래일 = (n: number): string[] => {
    const out: string[] = [];
    for (let i = 0; out.length < n; i++) {
      const d = new Date(Date.UTC(2025, 0, 1) + i * 86_400_000);
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
    }
    return out;
  };

  // The end date is shifted a day at a time - checking one case alone could pass by landing on a weekday by luck.
  it("startValue 는 언제나 목록에 있는 날짜다 (끝 날짜 60가지)", () => {
    const 전체 = 거래일(400);
    const 어긋난것: string[] = [];
    for (let n = 340; n < 400; n++) {
      const dates = 전체.slice(0, n);
      const s = windowStartDate(dates, true);
      if (s && !dates.includes(s)) 어긋난것.push(`${dates[n - 1]} → ${s}`);
    }
    expect(어긋난것, `축에 없는 날을 startValue 로 준다 — ECharts 가 무시한다`).toEqual([]);
  });

  it("데스크톱도 마찬가지 (끝 날짜 60가지)", () => {
    const 전체 = 거래일(400);
    const 어긋난것: string[] = [];
    for (let n = 340; n < 400; n++) {
      const dates = 전체.slice(0, n);
      const s = windowStartDate(dates, false);
      if (s && !dates.includes(s)) 어긋난것.push(`${dates[n - 1]} → ${s}`);
    }
    expect(어긋난것).toEqual([]);
  });

  it("windowAround 의 양끝도 언제나 목록에 있는 날짜다 (중심 60가지)", () => {
    const dates = 거래일(400);
    const 어긋난것: string[] = [];
    for (let i = 100; i < 160; i++) {
      const w = windowAround(dates, dates[i], true);
      if (!w) continue;
      if (!dates.includes(w.startValue)) 어긋난것.push(`start ${w.startValue}`);
      if (!dates.includes(w.endValue)) 어긋난것.push(`end ${w.endValue}`);
    }
    expect(어긋난것).toEqual([]);
  });

  it("창 길이는 여전히 대략 30일이다 — 스냅이 창을 망치지 않는다", () => {
    const dates = 거래일(400);
    const s = windowStartDate(dates, true)!;
    const 일수 = (Date.parse(dates[dates.length - 1]) - Date.parse(s)) / 86_400_000 + 1;
    expect(일수).toBeGreaterThan(25);
    expect(일수).toBeLessThanOrEqual(30);
  });
});

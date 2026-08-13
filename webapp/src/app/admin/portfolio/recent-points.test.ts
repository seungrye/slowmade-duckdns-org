// #95 — 모바일에서 매매 차트를 최근 N 일로 본다.
// #129 — **날짜로** 잡는다. 개수로 세면 거래일만 쌓이는 스냅샷에서 30 점이 6 주가 된다.
// #133 — **자르지 않는다.** 데이터는 다 두고 처음 보이는 창만 잡는다.
import { describe, it, expect } from 'vitest';
import {
  windowAround,
  windowStartDate,
  windowDays,
  MOBILE_CHART_DAYS,
  DESKTOP_CHART_DAYS,
} from './recent-points';

/** 하루 한 점씩, 마지막이 base 인 날짜 배열. */
function daily(n: number, base = '2026-08-12'): string[] {
  const end = new Date(`${base}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

/** 주말을 뺀(거래일만) 날짜 배열 — 실제 스냅샷이 이렇게 쌓인다. */
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

/** 시작일부터 마지막 날까지 달력 일수. */
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

  // #129 의 핵심 — 개수로 세던 시절엔 이게 41 일이었다.
  it('거래일만 쌓인 데이터도 **달력 기준**으로 한 달', () => {
    const dates = tradingDays(33); // 운영에서 실제로 33 점 / 45 일이었다
    expect(spanFrom(dates[0], dates)).toBeGreaterThan(MOBILE_CHART_DAYS);
    expect(spanFrom(windowStartDate(dates, true)!, dates)).toBe(MOBILE_CHART_DAYS);
  });

  // #133 — 데이터를 자르지 않으므로 창 밖의 옛 기간이 남아 있고, 밀어서 볼 수 있다.
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

// #135 — 매매 마커를 눌러 종목 상세로 넘어왔을 때. 그 날짜가 보이면서 창 길이는 그대로.
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

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

/**
 * 창의 경계는 **축에 실제로 있는 날짜**여야 한다 (#370).
 *
 * `startValue` 는 달력 날짜(마지막 날 −29일)로 계산되는데 x 축 카테고리는 **거래일**뿐이다.
 * 그 날이 주말·휴장일이면 축에 없는 값이 되고, ECharts 는 카테고리 축에서 못 찾은 값을
 * 무시해 **창이 안 잡힌 채 전체가 보인다.**
 *
 * 메인 차트(/admin/portfolio)는 스냅샷이 46일뿐이라 대개 "이미 창 안" 으로 빠져 이 경로를
 * 안 탔다. 몇 년치 일봉을 그리는 매매 상세에서만 드러났다.
 */
describe("창 경계는 축에 있는 날짜여야 한다 (#370)", () => {
  // 주말을 뺀 거래일만 — 실제 일봉과 같은 모양.
  const 거래일 = (n: number): string[] => {
    const out: string[] = [];
    for (let i = 0; out.length < n; i++) {
      const d = new Date(Date.UTC(2025, 0, 1) + i * 86_400_000);
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
    }
    return out;
  };

  // 끝나는 날을 하루씩 옮겨 가며 본다 — 한 경우만 보면 우연히 평일에 걸려 통과한다.
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

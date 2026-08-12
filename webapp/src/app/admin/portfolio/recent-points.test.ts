// #95 — 모바일에서 매매 차트를 최근 N 일로 자른다.
// #129 — **날짜로** 자른다. 개수로 자르면 거래일만 쌓이는 스냅샷에서 30 점이 6 주가 된다.
import { describe, it, expect } from 'vitest';
import { recentPoints, MOBILE_CHART_DAYS, DESKTOP_CHART_DAYS } from './recent-points';

/** 하루 한 점씩, 마지막이 base 인 배열. */
function daily(n: number, base = '2026-08-12') {
  const end = new Date(`${base}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (n - 1 - i));
    return { dateStr: d.toISOString().slice(0, 10) };
  });
}

/** 주말을 뺀(거래일만) 배열 — 실제 스냅샷이 이렇게 쌓인다. */
function tradingDays(n: number, base = '2026-08-12') {
  const out: { dateStr: string }[] = [];
  const d = new Date(`${base}T00:00:00Z`);
  while (out.length < n) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.unshift({ dateStr: d.toISOString().slice(0, 10) });
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

const spanDays = (rows: { dateStr: string }[]) =>
  Math.round(
    (Date.parse(rows[rows.length - 1].dateStr) - Date.parse(rows[0].dateStr)) / 86_400_000,
  ) + 1;

describe('recentPoints', () => {
  it('데스크톱은 최근 3 개월(90 일)', () => {
    const out = recentPoints(daily(200), false);
    expect(spanDays(out)).toBeLessThanOrEqual(DESKTOP_CHART_DAYS);
    expect(out[out.length - 1].dateStr).toBe('2026-08-12');
  });

  it('모바일은 최근 한 달(30 일)', () => {
    const out = recentPoints(daily(100), true);
    expect(spanDays(out)).toBeLessThanOrEqual(MOBILE_CHART_DAYS);
    expect(out[out.length - 1].dateStr).toBe('2026-08-12'); // 최신이 끝에
  });

  // #129 의 핵심 — 이게 개수 기준이던 시절엔 실패한다.
  it('거래일만 쌓인 데이터도 **달력 기준**으로 한 달을 넘지 않는다', () => {
    // 45 일에 걸친 33 점 — 운영에서 실제로 이랬다.
    const rows = tradingDays(33);
    expect(spanDays(rows)).toBeGreaterThan(MOBILE_CHART_DAYS); // 전제: 원본은 한 달을 넘는다

    const out = recentPoints(rows, true);
    expect(spanDays(out)).toBeLessThanOrEqual(MOBILE_CHART_DAYS);
    expect(out.length).toBeLessThan(rows.length);
  });

  it('자를 것이 없으면 받은 배열을 그대로 돌려준다 — 참조가 바뀌면 useMemo 가 헛돈다', () => {
    const few = daily(10);
    expect(recentPoints(few, true)).toBe(few);
    const mid = daily(50);
    expect(recentPoints(mid, false)).toBe(mid);
  });

  it('기준은 오늘이 아니라 **데이터의 마지막 날**이다 — 며칠 쉰 뒤에도 빈 차트가 되지 않는다', () => {
    const stale = daily(40, '2025-01-31'); // 한참 전 데이터
    const out = recentPoints(stale, true);
    expect(out.length).toBeGreaterThan(0);
    expect(out[out.length - 1].dateStr).toBe('2025-01-31');
  });

  it('모바일이 데스크톱보다 짧다', () => {
    expect(MOBILE_CHART_DAYS).toBeLessThan(DESKTOP_CHART_DAYS);
  });

  it('빈 배열도 안전하다', () => {
    const empty: { dateStr: string }[] = [];
    expect(recentPoints(empty, true)).toBe(empty);
  });

  it('days 를 직접 줄 수 있다', () => {
    expect(spanDays(recentPoints(daily(50), true, 7))).toBeLessThanOrEqual(7);
  });

  it('날짜를 읽을 수 없으면 자르지 않는다 — 잘못 잘라 없애느니 다 보여 준다', () => {
    const junk = [{ dateStr: 'nope' }, { dateStr: 'also-nope' }];
    expect(recentPoints(junk, true)).toBe(junk);
  });
});

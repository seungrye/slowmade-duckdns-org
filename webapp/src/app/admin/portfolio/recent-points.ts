// The trade chart's visible range (#95, corrected to date-based in #129, and windowed rather than trimmed in #133).
//
// /admin/portfolio has no period picker and draws every accumulated snapshot. As the days pass the points
// multiply, the lines smear on a narrow screen and the trade markers overlap.
//
// **The data is not trimmed.** All of it is passed and only `dataZoom`'s initially visible window is set to the last
// N days - that is what lets an earlier period be reached by dragging. Trimming would leave no way to see the rest.

/** The days shown initially on mobile. */
export const MOBILE_CHART_DAYS = 30;
/** The days shown initially on desktop - the last 3 months. */
export const DESKTOP_CHART_DAYS = 90;

/**
 * The first day in the list at or after `at`. The last day when there is none.
 *
 * A category axis's `dataZoom` **cannot recognise a value absent from the axis**. But the window boundary is computed
 * on the calendar (the last day minus 29) while the axis holds **trading days** only, so a weekend or holiday is a
 * value absent from the axis and ECharts ignores it outright - the window is never applied and everything shows (#370).
 *
 * The main chart has only 46 days of snapshots, so it usually short-circuits as "already inside the window" and never
 * took this path. It only surfaced on the trade detail, which draws years of daily bars.
 */
function snapForward(dates: string[], at: string): string {
  return dates.find((d) => d >= at) ?? dates[dates.length - 1];
}

/** The last day in the list at or before `at`. The first day when there is none. */
function snapBack(dates: string[], at: string): string {
  for (let i = dates.length - 1; i >= 0; i--) if (dates[i] <= at) return dates[i];
  return dates[0];
}

export function windowDays(isMobile: boolean, days?: number): number {
  return days ?? (isMobile ? MOBILE_CHART_DAYS : DESKTOP_CHART_DAYS);
}

/**
 * The **start date** of the initially visible window. Used directly as `dataZoom`'s `startValue`.
 *
 * **Measured by date, not by count.** It began as "a snapshot is one point a day, so the count is the day count" and
 * kept the last N points, but snapshots accumulate **only on trading days**. Production data had 33 points across 45
 * calendar days, so mobile showed six weeks (#129).
 *
 * The reference is **the data's last day**, not today. Measuring from today empties the window over a few quiet days.
 *
 * @returns undefined when no window is needed (the data is already inside it, or the dates cannot be read) -
 *   the caller then passes no `startValue` and leaves everything visible.
 */
export function windowStartDate(
  dates: string[],
  isMobile: boolean,
  days?: number,
): string | undefined {
  if (dates.length === 0) return undefined;

  const newest = Date.parse(dates[dates.length - 1]);
  const oldest = Date.parse(dates[0]);
  // Unreadable dates are left alone - showing everything beats hiding it by getting the window wrong.
  if (Number.isNaN(newest) || Number.isNaN(oldest)) return undefined;

  // `window` days including the last one - 30 days means the last day back through 29 days earlier.
  const cutoff = newest - (windowDays(isMobile, days) - 1) * 86_400_000;
  if (oldest >= cutoff) return undefined; // already inside the window

  // Snapped to a day that actually exists on the axis - a value that does not is ignored by ECharts (#370).
  return snapForward(dates, new Date(cutoff).toISOString().slice(0, 10));
}

/**
 * A window that **contains** a given date (#135) - for arriving at the symbol detail through a trade marker.
 *
 * It centres that date while keeping the usual length (30 days on mobile, 90 on desktop). Past the end of the data it
 * slides inward keeping the length - stopping the window running off the data and leaving half of it empty.
 *
 * When center cannot be read it returns undefined - the caller falls back to the recent window.
 */
export function windowAround(
  dates: string[],
  center: string,
  isMobile: boolean,
  days?: number,
): { startValue: string; endValue: string } | undefined {
  if (dates.length === 0) return undefined;

  const mid = Date.parse(center);
  const oldest = Date.parse(dates[0]);
  const newest = Date.parse(dates[dates.length - 1]);
  if (Number.isNaN(mid) || Number.isNaN(oldest) || Number.isNaN(newest)) return undefined;

  const span = (windowDays(isMobile, days) - 1) * 86_400_000;
  let start = mid - Math.floor(span / 2);
  let end = start + span;

  // Past the end of the data it slides inward keeping the length.
  if (end > newest) {
    end = newest;
    start = end - span;
  }
  if (start < oldest) {
    start = oldest;
    end = Math.min(newest, start + span);
  }

  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  // Both ends are snapped to days on the axis (#370). Snapped inward, so the window never runs off the data.
  return { startValue: snapForward(dates, iso(start)), endValue: snapBack(dates, iso(end)) };
}

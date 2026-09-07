import { connectToDB } from '@/lib/db';
import HolidayCache from '@/models/holiday-cache';
import { fetchSpecialDays } from './source';
import type { CalendarDay } from './types';

/**
 * The per-year cache (#328).
 *
 * **It never throws on failure.** The header badge is an extra, so the page must not break when the public data
 * portal is down for maintenance or the DB wobbles. Every failure returns the best of what is already there.
 */

/**
 * Collecting once a year is not enough - **ad hoc public holidays are designated mid-year**. Weekly is 52 calls a
 * year, well within quota, and catches a new designation within a week.
 */
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

type CachedYear = { fetchedAt?: Date; days?: CalendarDay[] };

export async function daysForYear(year: number, now: Date = new Date()): Promise<CalendarDay[]> {
  let cached: CachedYear | null = null;
  try {
    await connectToDB();
    cached = await HolidayCache.findOne({ year }).lean<CachedYear | null>();
  } catch {
    // DB 조회 실패 — 아래에서 수집을 시도한다.
  }

  const fresh =
    cached?.fetchedAt !== undefined &&
    now.getTime() - new Date(cached.fetchedAt).getTime() < STALE_AFTER_MS;
  if (cached && fresh) return cached.days ?? [];

  try {
    const days = await fetchSpecialDays(year);
    // An empty result never overwrites the cache. Wiping a year because the key is missing or the response was empty
    // would leave every later lookup empty too.
    if (days.length === 0) return cached?.days ?? [];

    await HolidayCache.findOneAndUpdate(
      { year },
      { $set: { year, fetchedAt: now, days } },
      { upsert: true }
    );
    return days;
  } catch {
    // Collection failed - use the stale cache rather than nothing.
    return cached?.days ?? [];
  }
}

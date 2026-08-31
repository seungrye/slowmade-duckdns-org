import { connectToDB } from '@/lib/db';
import HolidayCache from '@/models/holiday-cache';
import { fetchSpecialDays } from './source';
import type { CalendarDay } from './types';

/**
 * 연 단위 캐시 (#328).
 *
 * **실패해도 던지지 않는다.** 헤더 배지는 부가 기능이라, 공공데이터포털이 점검 중이거나
 * DB 가 흔들려도 화면이 깨지면 안 된다. 모든 실패는 "있는 것으로 최선"을 돌려준다.
 */

/**
 * 연 1회 수집으로는 부족하다 — **임시공휴일은 연중에 새로 지정**된다. 주 1회면 52회/년이라
 * 유량 걱정이 없으면서 새 지정을 일주일 안에 따라잡는다.
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
    // 빈 결과로 캐시를 덮지 않는다. 키가 없거나 응답이 비었을 때 그 해를 지워버리면,
    // 다음 조회부터 계속 비어 있게 된다.
    if (days.length === 0) return cached?.days ?? [];

    await HolidayCache.findOneAndUpdate(
      { year },
      { $set: { year, fetchedAt: now, days } },
      { upsert: true }
    );
    return days;
  } catch {
    // 수집 실패 — 묵은 캐시라도 쓴다.
    return cached?.days ?? [];
  }
}

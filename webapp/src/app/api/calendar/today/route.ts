import { apiSuccess } from '@/lib/api-response';
import { env } from '@/lib/env';
import { daysForYear } from '@/lib/calendar/cache';
import { decorate, dedupeEvents, isWorthShowing } from '@/lib/calendar/catalog';
import { seoulDateKey, todayInSeoul } from '@/lib/birthday';

/**
 * 오늘의 특일 (#328). 로그인 없이 볼 수 있다 — 공개 데이터다.
 *
 * **절대 오류를 내지 않는다.** 헤더 배지는 부가 기능이라, 무슨 일이 있어도 빈 배열을 주고
 * 화면은 조용히 아무것도 안 그린다.
 */
export async function GET() {
  // 키가 없으면 캐시·네트워크를 아예 건드리지 않는다(기능 off).
  if (!env.holidayApiKey) return apiSuccess({ events: [] });

  try {
    const now = new Date();
    const today = seoulDateKey(now);
    const days = await daysForYear(todayInSeoul(now).year, now);

    // 중복 제거(같은 날이 공휴일·기념일 양쪽에서 온다) → 설명 있는 것만 남긴다.
    const events = dedupeEvents(
      days.filter((d) => d.date === today).map((d) => decorate(d.name, d.kind))
    ).filter(isWorthShowing);

    return apiSuccess({ events });
  } catch (error) {
    console.error('Error loading today calendar:', error);
    return apiSuccess({ events: [] });
  }
}

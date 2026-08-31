import { apiSuccess } from '@/lib/api-response';
import { env } from '@/lib/env';
import { daysForYear } from '@/lib/calendar/cache';
import { decorate, dedupeEvents } from '@/lib/calendar/catalog';
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

    // 그날 것을 전부 내려보낸다. 설명이 없는 날(표에 없는 이름)도 기본 아이콘과 이름으로
    // 뜬다 — 안 뜨면 새로 지정된 공휴일을 놓치고, 그게 배지가 하나 느는 것보다 나쁘다.
    // 겹치는 것만 합친다: 같은 날이 공휴일·기념일 응답 양쪽에서 온다.
    const events = dedupeEvents(
      days.filter((d) => d.date === today).map((d) => decorate(d.name, d.kind))
    );

    return apiSuccess({ events });
  } catch (error) {
    console.error('Error loading today calendar:', error);
    return apiSuccess({ events: [] });
  }
}

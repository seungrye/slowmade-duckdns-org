/**
 * 글 작성 리듬 (#333) — **순수**. 날짜 목록만 받아 연속일수·주말·새벽을 센다.
 *
 * ── 왜 KST 로 가르나 ─────────────────────────────────────────────────
 *
 * "며칠 연속"과 "주말"과 "새벽"은 전부 **어느 시간대에서 보느냐**에 달렸다. 서버는 UTC 로
 * 도니 그대로 세면 KST 자정~오전 9시에 쓴 글이 전날로 밀린다 — 연속이 끊기고, 토요일 새벽
 * 글이 금요일로 잡힌다. 그래서 한국 날짜·시각으로 환산해 센다.
 *
 * 세 값을 한 번에 내는 이유는 목록을 세 번 훑지 않으려는 것도 있지만, **같은 환산을 세 번
 * 따로 구현하면 그중 하나만 틀리기 쉬워서**다.
 */

const TIME_ZONE = 'Asia/Seoul';
/** 새벽으로 치는 끝 시각(제외). 0~4시 = 5시 미만. */
const NIGHT_END_HOUR = 5;

export type Rhythm = {
  /** 가장 길었던 연속 작성 일수 */
  streak: number;
  /** 주말(토·일)에 쓴 글 수 */
  weekend: number;
  /** 새벽(0~5시)에 쓴 글 수 */
  night: number;
};

/** 'YYYY-MM-DD' 와 시각·요일을 KST 로 뽑는다. */
function seoulParts(date: Date): { day: string; hour: number; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  // hour12:false 라도 자정이 '24' 로 오는 환경이 있어 24 를 0 으로 되돌린다.
  const hour = Number(get('hour')) % 24;

  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour, weekday: get('weekday') };
}

/** 'YYYY-MM-DD' 를 하루 단위 정수로. 연속 판정에 쓴다. */
function dayNumber(day: string): number {
  return Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

export function postRhythm(dates: Date[]): Rhythm {
  const days = new Set<string>();
  let weekend = 0;
  let night = 0;

  for (const date of dates) {
    const { day, hour, weekday } = seoulParts(date);
    days.add(day);
    if (weekday === 'Sat' || weekday === 'Sun') weekend += 1;
    if (hour < NIGHT_END_HOUR) night += 1;
  }

  // 하루에 여러 개를 써도 하루다. 정렬해 이어지는 구간의 최대 길이를 잰다.
  const sorted = [...days].map(dayNumber).sort((a, b) => a - b);
  let streak = 0;
  let run = 0;
  let prev: number | null = null;
  for (const n of sorted) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    if (run > streak) streak = run;
    prev = n;
  }

  return { streak, weekend, night };
}

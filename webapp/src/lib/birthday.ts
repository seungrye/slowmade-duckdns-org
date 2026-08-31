/**
 * 생일 판정 (#326) — 순수 함수만. DB·DOM·네트워크를 모른다.
 *
 * ── 왜 전부 UTC 로 읽고 쓰나 ───────────────────────────────────────────
 *
 * 생일은 시각이 아니라 **날짜**다. 그런데 `new Date('1990-3-15')` 처럼 로컬 시간대로
 * 만들면 KST 사용자의 1990-03-15 가 UTC 로 `1990-03-14T15:00Z` 가 되어, 나중에
 * `getUTCDate()` 로 읽는 순간 **하루 밀린다**. 반대로 로컬 게터로 읽으면 서버(UTC)와
 * 브라우저(KST)가 서로 다른 답을 낸다.
 *
 * 그래서 저장은 `Date.UTC` 로 UTC 자정에 고정하고, 월·일도 UTC 게터로만 읽는다.
 * 시간대가 개입하는 곳은 단 하나 — "오늘이 며칠인가"뿐이고, 그건 `todayInSeoul` 이
 * KST 로 답한다.
 */

const TIME_ZONE = 'Asia/Seoul';
const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 1900;

export type SeoulDate = { year: number; month: number; day: number };

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * `<input type="date">` 의 'YYYY-MM-DD' 를 UTC 자정 Date 로. 못 읽으면 null.
 *
 * 존재하지 않는 날짜(2월 30일 등)를 반드시 걸러야 한다 — `Date.UTC(1990, 1, 30)` 은
 * 오류가 아니라 조용히 3월 2일이 되므로, 그냥 두면 엉뚱한 날에 폭죽이 터진다.
 */
export function parseBirthdayInput(input: string, now: Date = new Date()): Date | null {
  const m = PATTERN.exec(input);
  if (!m) return null;

  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < MIN_YEAR) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // 넘김(rollover) 감지: 넣은 값과 읽은 값이 다르면 없는 날짜다.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  // 미래 생일은 받지 않는다. 오늘(KST)까지는 허용.
  const today = todayInSeoul(now);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  if (date.getTime() > todayUtc) return null;

  return date;
}

/** UTC 자정 Date 를 'YYYY-MM-DD' 로. 없으면 빈 문자열(input 의 value 로 그대로 쓴다). */
export function formatBirthdayInput(date: Date | null | undefined): string {
  if (!date) return '';
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * KST 기준 오늘. 사용자 기기 시간대가 무엇이든 한국 날짜로 판정하려고 쓴다.
 * 'en-CA' 로케일이 YYYY-MM-DD 를 주므로 파싱이 단순하다.
 */
export function todayInSeoul(now: Date): SeoulDate {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number);
  return { year: y, month: m, day: d };
}

/**
 * KST 기준 오늘을 'YYYY-MM-DD' 문자열로. 달력 조회·localStorage 표식이 같은 키를 써야
 * 하루 경계가 어긋나지 않으므로 한 곳에서 만든다.
 */
export function seoulDateKey(now: Date): string {
  const { year, month, day } = todayInSeoul(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * KST 로 오늘이 생일인가.
 *
 * 2월 29일생은 평년에 생일이 없으므로 **3월 1일**에 축하한다. 윤년에는 2월 29일에만
 * 축하한다 — 윤년에 3월 1일까지 인정하면 같은 해에 두 번 터진다.
 */
export function isBirthdayToday(birthday: Date, now: Date): boolean {
  const month = birthday.getUTCMonth() + 1;
  const day = birthday.getUTCDate();
  const today = todayInSeoul(now);

  if (month === today.month && day === today.day) return true;

  const isLeapling = month === 2 && day === 29;
  if (isLeapling && !isLeapYear(today.year)) {
    return today.month === 3 && today.day === 1;
  }
  return false;
}

/**
 * 폭죽을 띄울까. 생일 당일이면서 **올해 아직 축하하지 않았을 때**만 true.
 *
 * `lastCelebratedYear` 는 호출측(localStorage)이 들고 있는 KST 연도 문자열이다.
 * 연도로 세는 덕에 연말 자정을 KST 로 넘겨도 새해 생일이 정상 판정된다.
 */
export function shouldCelebrate(
  birthday: Date | null | undefined,
  now: Date,
  lastCelebratedYear: string | null,
): boolean {
  if (!birthday) return false;
  if (!isBirthdayToday(birthday, now)) return false;
  return lastCelebratedYear !== String(todayInSeoul(now).year);
}

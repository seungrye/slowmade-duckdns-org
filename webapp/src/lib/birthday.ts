/**
 * Birthday evaluation (#326) - pure functions only. It knows nothing of the DB, the DOM or the network.
 *
 * ── Why everything is read and written in UTC ──────────────────────────
 *
 * A birthday is a **date**, not a moment. But building it in local time, as `new Date('1990-3-15')` does, turns a KST
 * user's 1990-03-15 into `1990-03-14T15:00Z`, which then reads back **a day early** through `getUTCDate()`. Reading
 * with local getters instead makes the server (UTC) and the browser (KST) give different answers.
 *
 * So it is stored pinned to UTC midnight via `Date.UTC`, and the month and day are read only with UTC getters.
 * Exactly one place involves a timezone - "what is today's date" - and `todayInSeoul` answers that in KST.
 */

const TIME_ZONE = 'Asia/Seoul';
const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 1900;

export type SeoulDate = { year: number; month: number; day: number };

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Turns an `<input type="date">` 'YYYY-MM-DD' into a UTC-midnight Date, or null if unreadable.
 *
 * A non-existent date (30 February and the like) must be caught: `Date.UTC(1990, 1, 30)` is not an error but
 * quietly becomes 2 March, so leaving it would fire the confetti on the wrong day.
 */
export function parseBirthdayInput(input: string, now: Date = new Date()): Date | null {
  const m = PATTERN.exec(input);
  if (!m) return null;

  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < MIN_YEAR) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // Rollover detection: if what was read back differs from what went in, the date does not exist.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  // A future birthday is rejected. Today (KST) is allowed.
  const today = todayInSeoul(now);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  if (date.getTime() > todayUtc) return null;

  return date;
}

/** A UTC-midnight Date as 'YYYY-MM-DD', or an empty string (used directly as an input's value). */
export function formatBirthdayInput(date: Date | null | undefined): string {
  if (!date) return '';
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Today in KST. Used so the judgement is made against the Korean date whatever the user's device timezone is.
 * The 'en-CA' locale gives YYYY-MM-DD, which keeps the parsing simple.
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
 * Today in KST as a 'YYYY-MM-DD' string. The calendar query and the localStorage marker have to use the same key
 * for the day boundary to line up, so it is produced in one place.
 */
export function seoulDateKey(now: Date): string {
  const { year, month, day } = todayInSeoul(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Whether today is the birthday, in KST.
 *
 * Someone born on 29 February has no birthday in a common year, so they are celebrated on **1 March**. In a leap
 * year they are celebrated only on 29 February - allowing 1 March as well would fire twice in one year.
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
 * Whether to fire the confetti. True only on the birthday itself **and** when this year's celebration has not happened yet.
 *
 * `lastCelebratedYear` is the KST year string the caller holds (in localStorage). Counting by year means a KST
 * midnight at the turn of the year still evaluates the new year's birthday correctly.
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

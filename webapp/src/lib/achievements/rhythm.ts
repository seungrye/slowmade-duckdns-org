/**
 * Writing rhythm (#333) - **pure**. Given only a list of dates it counts streaks, weekends and small hours.
 *
 * ── Why it splits by KST ─────────────────────────────────────────────
 *
 * "Days in a row", "weekend" and "small hours" all depend on **which timezone you look from**. The server runs in
 * UTC, so counting there pushes anything written between midnight and 09:00 KST back a day - streaks break, and a
 * Saturday small-hours post lands on Friday. So it converts to Korean dates and times before counting.
 *
 * The three values come out together partly to walk the list once, but mostly because **implementing the same
 * conversion three separate times makes it easy to get exactly one of them wrong**.
 */

const TIME_ZONE = 'Asia/Seoul';
/** The exclusive end of the small hours. 0-4 o'clock = below 5. */
const NIGHT_END_HOUR = 5;

export type Rhythm = {
  /** The longest run of consecutive writing days */
  streak: number;
  /** Posts written at the weekend (Saturday or Sunday) */
  weekend: number;
  /** Posts written in the small hours (0-5) */
  night: number;
};

/** Extracts 'YYYY-MM-DD' plus the hour and weekday in KST. */
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
  // Even with hour12:false some environments report midnight as '24', so 24 is folded back to 0.
  const hour = Number(get('hour')) % 24;

  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour, weekday: get('weekday') };
}

/** 'YYYY-MM-DD' as a whole-day integer. Used to judge streaks. */
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

  // Several posts in a day are still one day. Sort and measure the longest contiguous run.
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

/** Shared types for the calendar badge (#328). Gathered here so parse, catalog and cache do not import each other. */

export type EventKind = 'holiday' | 'anniversary' | 'season';

/** One day's entry as stored in the cache. `date` is a KST Gregorian 'YYYY-MM-DD'. */
export type CalendarDay = {
  date: string;
  name: string;
  kind: EventKind;
};

/** The shape sent to the UI - the name with an icon and description attached. */
export type CalendarEvent = {
  name: string;
  kind: EventKind;
  icon: string;
  description: string;
};

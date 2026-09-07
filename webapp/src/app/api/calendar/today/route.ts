import { apiSuccess } from '@/lib/api-response';
import { env } from '@/lib/env';
import { daysForYear } from '@/lib/calendar/cache';
import { decorate, dedupeEvents } from '@/lib/calendar/catalog';
import { seoulDateKey, todayInSeoul } from '@/lib/birthday';

/**
 * Today's special days (#328). Visible without logging in - it is public data.
 *
 * **It never errors.** The header badge is an extra, so whatever happens it returns an empty array and the UI
 * quietly draws nothing.
 */
export async function GET() {
  // With no key it touches neither the cache nor the network (the feature is off).
  if (!env.holidayApiKey) return apiSuccess({ events: [] });

  try {
    const now = new Date();
    const today = seoulDateKey(now);
    const days = await daysForYear(todayInSeoul(now).year, now);

    // Everything for that day is sent down. A day with no description (a name absent from the table) still appears with
    // a default icon and its name - not appearing would mean missing a newly designated holiday, which is worse than one extra badge.
    // Only overlaps are merged: the same day arrives from both the holiday and observance responses.
    const events = dedupeEvents(
      days.filter((d) => d.date === today).map((d) => decorate(d.name, d.kind))
    );

    return apiSuccess({ events });
  } catch (error) {
    console.error('Error loading today calendar:', error);
    return apiSuccess({ events: [] });
  }
}

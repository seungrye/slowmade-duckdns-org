// Notification read state (#247) - the pure part.
//
// Opening `/notifications` used to mark everything read (it pushed `notificationsSeenAt` to now). So the "unread"
// marking survived only **the first render** after a new comment arrived and vanished on a reload - however bold the
// marker was, there was nothing left to see by the time you looked.
//
// Read now means **"dealt with"**, not "seen". Tapping an item and going to that comment marks only that one read.
//
// ── Two values decide it together ────────────────────────────────────
//
//   the baseline `notificationsSeenAt`   anything older is read, unconditionally
//   the per-item `notificationsReadIds`  the ones newer than the baseline that were tapped
//
// Dropping the baseline and keeping only the per-item list would resurrect all 122 existing ones as unread and push
// the badge back to 99+. [mark all read] is then one thing: raise the baseline to now and empty the per-item list.

/**
 * The cap on the read-id list.
 *
 * Never pressing [mark all read] means it grows with every tap, so there is a cap. Overflowing drops the oldest
 * safely - once the baseline rises they count as read anyway.
 */
export const READ_IDS_CAP = 200;

/**
 * Whether to mark this item "unread".
 *
 * @param createdAt when the comment was posted. Absent means no judgement (the quiet side).
 * @param seenAt    the baseline. Anything older is read.
 * @param readIds   the comment ids that were tapped.
 * @param id        this comment's id.
 */
export function isUnread(
  createdAt: Date | string | null | undefined,
  seenAt: Date,
  readIds: Set<string>,
  id: string,
): boolean {
  if (!createdAt) return false;
  if (new Date(createdAt) <= seenAt) return false;
  return !readIds.has(id);
}

/** The read list with one added. Duplicates do not grow it, and overflowing the cap drops the oldest. */
export function nextReadIds(current: string[], id: string, cap: number = READ_IDS_CAP): string[] {
  if (current.includes(id)) return current;
  return [...current, id].slice(-cap);
}

/** The computed field name used only for sorting. It is removed from the result. */
export const UNREAD_FIELD = '_unread';

/**
 * The notification list pipeline - **unread first, then newest** (#249).
 *
 * Why the sort happens in the DB: the list fetches only the most recent `limit`. Sorting in code **after** fetching
 * shuffles only within that slice, so an unread notification that falls outside `limit` chronologically is never
 * fetched at all and has no chance to rise - while the bell badge counts it and the list does not have it.
 * (With 25 items after seenAt, tapping the newest 20 one by one leaves the remaining 5 in exactly that state.)
 * So it sorts **before** slicing.
 *
 * Unread is judged by the same rule as `isUnread` - newer than the baseline and not tapped.
 */
export function notificationPipeline(
  filter: Record<string, unknown>,
  seenAt: Date,
  readIds: string[],
  limit: number,
): Record<string, unknown>[] {
  const isNew = { $gt: ['$createdAt', seenAt] };
  // readIds are strings and _id is an ObjectId, so comparing them directly never matches - a tapped notification
  // would then stay unread and stick to the top.
  const notClicked =
    readIds.length > 0 ? { $not: { $in: [{ $toString: '$_id' }, readIds] } } : true;

  return [
    { $match: filter },
    { $addFields: { [UNREAD_FIELD]: { $and: [isNew, notClicked] } } },
    { $sort: { [UNREAD_FIELD]: -1, createdAt: -1 } },
    { $limit: limit },
    { $unset: UNREAD_FIELD },
  ];
}

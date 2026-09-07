import EnjiImageQuota from '@/models/enji-image-quota';

/**
 * Today's date key in UTC (`YYYY-MM-DD`).
 */
export function todayKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Atomically increments today's image-generation count, succeeding only below the limit.
 *
 * Implementation:
 * `findOneAndUpdate({ _id: today, count: { $lt: limit } }, { $inc: { count: 1 }, $setOnInsert: { _id: today } }, { upsert: true, new: true })`
 *
 * - With no document it upserts (insert with count=0 plus the inc -> count=1).
 * - Below the limit the inc applies and the new document is returned -> true.
 * - At or above the limit the filter does not match and it returns null -> false.
 * - A duplicate key (E11000) from a concurrent upsert -> false.
 */
export async function tryConsumeDailyQuota(limit: number): Promise<boolean> {
  const key = todayKey();
  try {
    const result = await EnjiImageQuota.findOneAndUpdate(
      { _id: key, count: { $lt: limit } },
      { $inc: { count: 1 }, $setOnInsert: { _id: key } },
      { upsert: true, new: true },
    );
    return result !== null;
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 11000) {
      // When another instance inserted during the upsert and the count is already at the limit.
      return false;
    }
    throw err;
  }
}

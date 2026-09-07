import PainterImageQuota from '@/models/painter-image-quota';

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
 * Atomically increments painter-bot's image-generation count for today, succeeding only below the limit.
 *
 * The implementation follows the same pattern as enji-bot's quota but uses a separate collection (`PainterImageQuota`).
 */
export async function tryConsumeDailyQuota(limit: number): Promise<boolean> {
  const key = todayKey();
  try {
    const result = await PainterImageQuota.findOneAndUpdate(
      { _id: key, count: { $lt: limit } },
      { $inc: { count: 1 }, $setOnInsert: { _id: key } },
      { upsert: true, new: true },
    );
    return result !== null;
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 11000) {
      return false;
    }
    throw err;
  }
}

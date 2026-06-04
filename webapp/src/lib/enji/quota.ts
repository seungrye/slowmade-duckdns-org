import EnjiImageQuota from '@/models/enji-image-quota';

/**
 * UTC 기준 오늘 날짜 키 (`YYYY-MM-DD`).
 */
export function todayKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 오늘의 이미지 생성 카운트를 원자적으로 +1. 한도(`limit`) 미만일 때만 성공.
 *
 * 구현:
 * `findOneAndUpdate({ _id: today, count: { $lt: limit } }, { $inc: { count: 1 }, $setOnInsert: { _id: today } }, { upsert: true, new: true })`
 *
 * - 문서가 없으면 upsert (insert with count=0 + inc → count=1).
 * - count 가 limit 미만이면 inc 적용 후 새 문서 반환 → true.
 * - count 가 이미 limit 이상이면 filter 가 매치되지 않아 null → false.
 * - upsert 동시성 경합으로 duplicate key (E11000) 발생 시 false.
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
      // upsert 중 다른 인스턴스가 이미 insert 한 직후 count >= limit 인 경우.
      return false;
    }
    throw err;
  }
}

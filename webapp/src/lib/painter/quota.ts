import PainterImageQuota from '@/models/painter-image-quota';

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
 * painter-bot 오늘의 이미지 생성 카운트를 원자적으로 +1. 한도(`limit`) 미만일 때만 성공.
 *
 * 구현은 enji-bot quota 와 동일 패턴이지만 별도 collection (`PainterImageQuota`) 사용.
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

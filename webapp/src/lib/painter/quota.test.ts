import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const findOneAndUpdate = vi.hoisted(() => vi.fn());
vi.mock('@/models/painter-image-quota', () => ({
  default: { findOneAndUpdate },
}));

import { tryConsumeDailyQuota, todayKey } from './quota';

describe('painter todayKey', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('UTC 기준으로 YYYY-MM-DD 키 반환', () => {
    vi.setSystemTime(new Date('2026-06-05T15:30:00Z'));
    expect(todayKey()).toBe('2026-06-05');
  });
});

describe('painter tryConsumeDailyQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('한도 미만이면 카운트를 +1 하고 true 반환 (painter 컬렉션 사용)', async () => {
    findOneAndUpdate.mockResolvedValueOnce({ _id: '2026-06-05', count: 5 });
    const ok = await tryConsumeDailyQuota(50);
    expect(ok).toBe(true);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, opts] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ _id: '2026-06-05', count: { $lt: 50 } });
    expect(update).toEqual({ $inc: { count: 1 }, $setOnInsert: { _id: '2026-06-05' } });
    expect(opts).toEqual({ upsert: true, new: true });
  });

  it('한도 초과면 false 반환 (duplicate key 에러 시)', async () => {
    const dupErr = Object.assign(new Error('E11000 duplicate'), { code: 11000 });
    findOneAndUpdate.mockRejectedValueOnce(dupErr);
    const ok = await tryConsumeDailyQuota(50);
    expect(ok).toBe(false);
  });

  it('한도 초과면 false 반환 (null 결과 시)', async () => {
    findOneAndUpdate.mockResolvedValueOnce(null);
    const ok = await tryConsumeDailyQuota(50);
    expect(ok).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/holiday-cache', () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));
vi.mock('./source', () => ({ fetchSpecialDays: vi.fn() }));

import { daysForYear, STALE_AFTER_MS } from './cache';
import HolidayCache from '@/models/holiday-cache';
import { fetchSpecialDays } from './source';
import type { CalendarDay } from './types';

const mockFindOne = HolidayCache.findOne as ReturnType<typeof vi.fn>;
const mockUpsert = HolidayCache.findOneAndUpdate as ReturnType<typeof vi.fn>;
const mockFetch = fetchSpecialDays as ReturnType<typeof vi.fn>;

const CACHED: CalendarDay[] = [{ date: '2026-02-17', name: '설날', kind: 'holiday' }];
const FRESH: CalendarDay[] = [{ date: '2026-08-15', name: '광복절', kind: 'holiday' }];

const now = new Date('2026-08-31T00:00:00Z');
const stub = (doc: unknown) => mockFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(doc) });

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsert.mockResolvedValue({});
});

describe('daysForYear', () => {
  it('신선한 캐시가 있으면 그대로 쓰고 API 를 부르지 않는다', async () => {
    stub({ year: 2026, fetchedAt: new Date(now.getTime() - 1000), days: CACHED });

    expect(await daysForYear(2026, now)).toEqual(CACHED);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('캐시가 없으면 받아서 저장한다', async () => {
    stub(null);
    mockFetch.mockResolvedValue(FRESH);

    expect(await daysForYear(2026, now)).toEqual(FRESH);
    expect(mockFetch).toHaveBeenCalledWith(2026);
    const [filter, update] = mockUpsert.mock.calls[0];
    expect(filter).toEqual({ year: 2026 });
    expect(update.$set.days).toEqual(FRESH);
  });

  it('캐시가 오래되면 다시 받는다 — 임시공휴일이 연중에 지정되기 때문', async () => {
    stub({ year: 2026, fetchedAt: new Date(now.getTime() - STALE_AFTER_MS - 1), days: CACHED });
    mockFetch.mockResolvedValue(FRESH);

    expect(await daysForYear(2026, now)).toEqual(FRESH);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('만료 직전이면 아직 안 받는다 (경계)', async () => {
    stub({ year: 2026, fetchedAt: new Date(now.getTime() - STALE_AFTER_MS + 1000), days: CACHED });

    expect(await daysForYear(2026, now)).toEqual(CACHED);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('수집이 실패하면 묵은 캐시를 그대로 쓴다 — 달력 때문에 헤더가 깨지면 안 된다', async () => {
    stub({ year: 2026, fetchedAt: new Date(now.getTime() - STALE_AFTER_MS - 1), days: CACHED });
    mockFetch.mockRejectedValue(new Error('공공데이터포털 점검 중'));

    expect(await daysForYear(2026, now)).toEqual(CACHED);
    // 실패한 결과로 캐시를 덮지 않는다.
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('캐시도 없고 수집도 실패하면 빈 배열 — 던지지 않는다', async () => {
    stub(null);
    mockFetch.mockRejectedValue(new Error('키 없음'));

    expect(await daysForYear(2026, now)).toEqual([]);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('수집 결과가 비면 저장하지 않는다 — 빈 응답으로 그 해를 지워버리면 안 된다', async () => {
    stub(null);
    mockFetch.mockResolvedValue([]);

    expect(await daysForYear(2026, now)).toEqual([]);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('DB 조회가 실패해도 던지지 않는다', async () => {
    mockFindOne.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('mongo down')) });
    mockFetch.mockResolvedValue(FRESH);

    expect(await daysForYear(2026, now)).toEqual(FRESH);
  });
});

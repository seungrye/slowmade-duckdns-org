import { describe, it, expect, vi, beforeEach } from 'vitest';

// Both the presence and absence of a key must be exercised, so a mutable object is used instead of a fixed literal.
// A vi.mock factory is hoisted to the top, so it can only reference something created with vi.hoisted.
const { env } = vi.hoisted(() => ({ env: { holidayApiKey: 'test-key' } }));
vi.mock('@/lib/env', () => ({ env }));
vi.mock('@/lib/calendar/cache', () => ({ daysForYear: vi.fn() }));

import { GET } from './route';
import { daysForYear } from '@/lib/calendar/cache';
import type { CalendarDay } from '@/lib/calendar/types';

const mockDays = daysForYear as ReturnType<typeof vi.fn>;

// The clock is pinned to 2026-08-15 (Liberation Day). It is KST-based, so 15:00 the previous day in UTC.
const onLiberationDay = new Date('2026-08-14T15:00:00Z');

const YEAR_2026: CalendarDay[] = [
  { date: '2026-08-15', name: '광복절', kind: 'holiday' },
  { date: '2026-08-15', name: '입추', kind: 'season' },
  { date: '2026-08-16', name: '식목일', kind: 'anniversary' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  env.holidayApiKey = 'test-key';
});

const body = async () => (await GET()).json();

describe('GET /api/calendar/today', () => {
  it('키가 없으면 빈 배열 — 기능이 조용히 꺼진다', async () => {
    env.holidayApiKey = '';
    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.events).toEqual([]);
    // With no key it touches neither the cache nor the network.
    expect(mockDays).not.toHaveBeenCalled();
  });

  it('오늘(KST) 것만 골라 아이콘·설명을 붙여 내려준다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(onLiberationDay);
    mockDays.mockResolvedValue(YEAR_2026);

    const { data } = await body();

    expect(mockDays).toHaveBeenCalledWith(2026, expect.any(Date));
    expect(data.events).toHaveLength(2); // 08-16 drops out
    expect(data.events[0]).toEqual({
      name: '광복절',
      kind: 'holiday',
      icon: '🎗️',
      description: expect.stringContaining('1945'),
    });
    // Sorted by weight - holidays first, solar terms last. The front of the stack must be the most important day.
    expect(data.events[1].name).toBe('입추');
  });

  it('표에 없어 설명이 없는 날도 내려준다 — 안 뜨면 새 공휴일을 놓친다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(onLiberationDay);
    mockDays.mockResolvedValue([
      { date: '2026-08-15', name: '광복절', kind: 'holiday' },
      { date: '2026-08-15', name: '처음 보는 임시공휴일', kind: 'holiday' },
      { date: '2026-08-15', name: '조달의 날', kind: 'anniversary' },
    ]);

    const { data } = await body();
    const names = data.events.map((e: { name: string }) => e.name);

    expect(names).toContain('처음 보는 임시공휴일');
    expect(names).toContain('조달의 날');
    // Only the description is missing; an icon is always attached, defaulting by kind.
    for (const e of data.events) expect(e.icon).toBeTruthy();
  });

  it('같은 날 같은 이름이 두 종류로 와도 한 번만 내려준다', async () => {
    // Measured: Children's Day and Memorial Day appear in both the holiday and observance responses.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T15:00:00Z')); // KST 2026-06-06
    mockDays.mockResolvedValue([
      { date: '2026-06-06', name: '현충일', kind: 'anniversary' },
      { date: '2026-06-06', name: '현충일', kind: 'holiday' },
    ]);

    const { data } = await body();

    expect(data.events).toHaveLength(1);
    expect(data.events[0].kind).toBe('holiday');
  });

  it('해당 없는 날이면 빈 배열', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T03:00:00Z'));
    mockDays.mockResolvedValue(YEAR_2026);

    expect((await body()).data.events).toEqual([]);
  });

  it('KST 연 경계에서 다음 해 달력을 본다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T15:00:00Z')); // KST 2027-01-01
    mockDays.mockResolvedValue([{ date: '2027-01-01', name: '1월1일', kind: 'holiday' }]);

    const { data } = await body();

    expect(mockDays).toHaveBeenCalledWith(2027, expect.any(Date));
    expect(data.events[0].name).toBe('신정'); // normalised through the alias
  });

  it('캐시 계층이 던져도 500 대신 빈 배열 — 헤더가 깨지면 안 된다', async () => {
    mockDays.mockRejectedValue(new Error('mongo down'));
    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.events).toEqual([]);
  });
});

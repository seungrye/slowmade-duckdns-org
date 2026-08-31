import { describe, it, expect, vi, beforeEach } from 'vitest';

// 키 유무를 둘 다 시험해야 해서 고정 리터럴 대신 가변 객체를 쓴다.
// vi.mock 팩토리는 최상단으로 끌어올려지므로 vi.hoisted 로 만들어야 참조할 수 있다.
const { env } = vi.hoisted(() => ({ env: { holidayApiKey: 'test-key' } }));
vi.mock('@/lib/env', () => ({ env }));
vi.mock('@/lib/calendar/cache', () => ({ daysForYear: vi.fn() }));

import { GET } from './route';
import { daysForYear } from '@/lib/calendar/cache';
import type { CalendarDay } from '@/lib/calendar/types';

const mockDays = daysForYear as ReturnType<typeof vi.fn>;

// 2026-08-15(광복절)로 시계를 고정한다. KST 기준이라 UTC 로는 전날 15:00.
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
    // 키가 없으면 캐시·네트워크를 아예 건드리지 않는다.
    expect(mockDays).not.toHaveBeenCalled();
  });

  it('오늘(KST) 것만 골라 아이콘·설명을 붙여 내려준다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(onLiberationDay);
    mockDays.mockResolvedValue(YEAR_2026);

    const { data } = await body();

    expect(mockDays).toHaveBeenCalledWith(2026, expect.any(Date));
    expect(data.events).toHaveLength(2); // 08-16 은 빠진다
    expect(data.events[0]).toEqual({
      name: '광복절',
      kind: 'holiday',
      icon: '🎗️',
      description: expect.stringContaining('1945'),
    });
    // 무게순 정렬 — 공휴일이 앞, 절기가 뒤. 스택 맨 앞이 가장 중요한 날이어야 한다.
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
    // 설명이 없을 뿐, 아이콘은 종류별 기본값으로 반드시 붙는다.
    for (const e of data.events) expect(e.icon).toBeTruthy();
  });

  it('같은 날 같은 이름이 두 종류로 와도 한 번만 내려준다', async () => {
    // 실측: 어린이날·현충일이 공휴일·기념일 응답 양쪽에 있다.
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
    expect(data.events[0].name).toBe('신정'); // 별칭으로 정규화된다
  });

  it('캐시 계층이 던져도 500 대신 빈 배열 — 헤더가 깨지면 안 된다', async () => {
    mockDays.mockRejectedValue(new Error('mongo down'));
    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).data.events).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { parseSpecialDays } from './parse';
import { decorate } from './catalog';
import live from './__fixtures__/live-2026.json';

/**
 * Pinning the real response shape (#328).
 *
 * This feature was built without a service key, so **the parser was written without ever seeing a response.** Once a
 * key arrived and it was measured, two things were wrong - observances and solar terms all carry `isHoliday: 'N'`,
 * flattening the kinds, and the spacing differs per endpoint, so the table did not match.
 *
 * So representative items from the real response are pinned in `__fixtures__/live-2026.json`. They are **a genuine
 * response**, not a mock, so repeating the same mistake while touching the parser is caught here.
 */
describe('실제 응답(2026) 종단 확인', () => {
  it('공휴일: 실제 응답은 전부 isHoliday=Y 라 모두 공휴일로 남는다', () => {
    const days = parseSpecialDays(live.getRestDeInfo, 'holiday');
    const byName = Object.fromEntries(days.map((d) => [d.name, d]));

    expect(byName['1월1일'].kind).toBe('holiday');
    expect(byName['광복절'].kind).toBe('holiday');
    // Constitution Day is Y in the 2026 response too - "a national day you still work" is out of date, and the code must not assume it.
    expect(byName['제헌절'].kind).toBe('holiday');
    expect(byName['설날'].date).toMatch(/^2026-02-1[5-8]$/);
  });

  it('24절기: isHoliday 가 전부 N 이어도 절기로 남는다', () => {
    const days = parseSpecialDays(live.get24DivisionsInfo, 'season');

    expect(days.length).toBeGreaterThan(0);
    expect(days.every((d) => d.kind === 'season')).toBe(true);
  });

  it('기념일: isHoliday 가 전부 N 이어도 기념일로 남는다', () => {
    const days = parseSpecialDays(live.getAnniversaryInfo, 'anniversary');

    expect(days.length).toBeGreaterThan(0);
    expect(days.every((d) => d.kind === 'anniversary')).toBe(true);
  });

  it('실제 이름이 표에 걸린다 — 띄어쓰기·별칭이 맞아야 설명이 붙는다', () => {
    const holidays = parseSpecialDays(live.getRestDeInfo, 'holiday');
    const seasons = parseSpecialDays(live.get24DivisionsInfo, 'season');

    for (const day of [...holidays, ...seasons]) {
      const event = decorate(day.name, day.kind);
      expect(event.description, `${day.name} 설명`).not.toBe('');
    }
  });

  it('locdate 숫자를 날짜 문자열로 바꾼다', () => {
    const days = parseSpecialDays(live.get24DivisionsInfo, 'season');
    for (const d of days) {
      expect(d.date, d.name).toMatch(/^2026-\d{2}-\d{2}$/);
    }
  });
});

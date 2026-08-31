import { describe, it, expect } from 'vitest';
import { parseSpecialDays } from './parse';
import { decorate } from './catalog';
import live from './__fixtures__/live-2026.json';

/**
 * 실제 응답 형식 고정 (#328).
 *
 * 이 기능은 서비스 키 없이 만들어져 **응답을 못 본 채 파서를 짰다.** 나중에 키를 받아
 * 실측했더니 두 가지가 어긋나 있었다 — 기념일·절기가 전부 `isHoliday: 'N'` 이라 종류가
 * 뭉개졌고, 엔드포인트마다 띄어쓰기가 달라 표가 안 맞았다.
 *
 * 그래서 실제 응답에서 대표 항목만 추려 `__fixtures__/live-2026.json` 에 박아 둔다.
 * 목이 아니라 **진짜 응답**이라, 파서를 건드릴 때 같은 실수를 되풀이하면 여기서 걸린다.
 */
describe('실제 응답(2026) 종단 확인', () => {
  it('공휴일: 실제 응답은 전부 isHoliday=Y 라 모두 공휴일로 남는다', () => {
    const days = parseSpecialDays(live.getRestDeInfo, 'holiday');
    const byName = Object.fromEntries(days.map((d) => [d.name, d]));

    expect(byName['1월1일'].kind).toBe('holiday');
    expect(byName['광복절'].kind).toBe('holiday');
    // 제헌절도 2026 응답에서는 Y 다 — "국경일이지만 안 쉰다"는 옛말이라 코드가 단정하면 안 된다.
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

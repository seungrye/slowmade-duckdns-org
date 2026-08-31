import { describe, it, expect } from 'vitest';
import { parseSpecialDays } from './parse';

const envelope = (items: unknown, resultCode = '00') => ({
  response: {
    header: { resultCode, resultMsg: resultCode === '00' ? 'NORMAL SERVICE.' : 'ERROR' },
    body: { items, numOfRows: 100, pageNo: 1, totalCount: 1 },
  },
});

describe('parseSpecialDays', () => {
  it('항목이 배열이면 그대로 읽는다', () => {
    const payload = envelope({
      item: [
        { dateKind: '01', dateName: '1월1일', isHoliday: 'Y', locdate: 20260101, seq: 1 },
        { dateKind: '01', dateName: '설날', isHoliday: 'Y', locdate: 20260217, seq: 1 },
      ],
    });
    expect(parseSpecialDays(payload, 'holiday')).toEqual([
      { date: '2026-01-01', name: '1월1일', kind: 'holiday' },
      { date: '2026-02-17', name: '설날', kind: 'holiday' },
    ]);
  });

  it('항목이 1건이면 배열이 아니라 객체로 온다 — 그것도 읽는다', () => {
    const payload = envelope({
      item: { dateName: '동지', locdate: 20261222 },
    });
    expect(parseSpecialDays(payload, 'season')).toEqual([
      { date: '2026-12-22', name: '동지', kind: 'season' },
    ]);
  });

  it.each([
    ['빈 문자열', ''],
    ['null', null],
    ['undefined', undefined],
    ['item 없음', {}],
  ])('항목이 %s 면 빈 배열', (_label, items) => {
    expect(parseSpecialDays(envelope(items), 'holiday')).toEqual([]);
  });

  it('locdate 가 문자열로 와도 읽는다', () => {
    const payload = envelope({ item: { dateName: '입춘', locdate: '20260204' } });
    expect(parseSpecialDays(payload, 'season')[0].date).toBe('2026-02-04');
  });

  it('공휴일 목록에 있어도 isHoliday=N 이면 기념일로 낮춘다', () => {
    // 색 배지는 "쉬는 날"로 읽힌다. 안 쉬는 날이 섞이면 무게를 낮춰야 한다.
    // (실측 2026 에서는 22건이 전부 Y 라 걸리지 않지만, 지정은 해마다 바뀐다.)
    const payload = envelope({
      item: [
        { dateName: '어떤국경일', isHoliday: 'N', locdate: 20260717 },
        { dateName: '광복절', isHoliday: 'Y', locdate: 20260815 },
      ],
    });
    expect(parseSpecialDays(payload, 'holiday')).toEqual([
      { date: '2026-07-17', name: '어떤국경일', kind: 'anniversary' },
      { date: '2026-08-15', name: '광복절', kind: 'holiday' },
    ]);
  });

  it('기념일·절기는 전부 isHoliday=N 이라 낮추지 않는다 — 낮추면 24절기가 통째로 기념일이 된다', () => {
    // 실측(2026): getAnniversaryInfo 82건·get24DivisionsInfo 24건이 모두 isHoliday='N'.
    const payload = envelope({
      item: [
        { dateName: '동지', isHoliday: 'N', locdate: 20261222 },
        { dateName: '소한', isHoliday: 'N', locdate: 20260105 },
      ],
    });
    expect(parseSpecialDays(payload, 'season').every((d) => d.kind === 'season')).toBe(true);

    const anniv = envelope({ item: { dateName: '어버이 날', isHoliday: 'N', locdate: 20260508 } });
    expect(parseSpecialDays(anniv, 'anniversary')[0].kind).toBe('anniversary');
  });

  it('isHoliday 가 아예 없으면 넘긴 종류를 그대로 쓴다', () => {
    const payload = envelope({ item: { dateName: '어버이날', locdate: 20260508 } });
    expect(parseSpecialDays(payload, 'anniversary')[0].kind).toBe('anniversary');
  });

  it.each([
    ['날짜 없음', { dateName: '이름만' }],
    ['이름 없음', { locdate: 20260101 }],
    ['날짜 형식 이상', { dateName: 'x', locdate: 123 }],
  ])('%s 인 항목은 건너뛴다 — 한 건 때문에 전부 잃지 않는다', (_label, bad) => {
    const payload = envelope({ item: [bad, { dateName: '설날', locdate: 20260217 }] });
    expect(parseSpecialDays(payload, 'holiday')).toEqual([
      { date: '2026-02-17', name: '설날', kind: 'holiday' },
    ]);
  });

  it('resultCode 가 정상이 아니면 던진다 — 빈 결과로 캐시를 덮으면 안 된다', () => {
    expect(() => parseSpecialDays(envelope({ item: [] }, '30'), 'holiday')).toThrow();
  });

  it('응답 껍데기가 아예 다르면 던진다', () => {
    expect(() => parseSpecialDays({ nope: true }, 'holiday')).toThrow();
    expect(() => parseSpecialDays('<html>error</html>', 'holiday')).toThrow();
  });
});

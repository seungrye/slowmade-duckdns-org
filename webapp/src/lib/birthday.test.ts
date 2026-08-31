import { describe, it, expect } from 'vitest';
import {
  parseBirthdayInput,
  formatBirthdayInput,
  todayInSeoul,
  isBirthdayToday,
  shouldCelebrate,
} from './birthday';

// 판정 기준 시각은 전부 UTC 로 적는다. KST = UTC+9 이므로 UTC 15:00 이 KST 다음날 00:00 이다.
const utc = (s: string) => new Date(s);

describe('parseBirthdayInput', () => {
  const now = utc('2026-08-31T00:00:00Z');

  it("'YYYY-MM-DD' 를 UTC 자정으로 만든다", () => {
    const d = parseBirthdayInput('1990-03-15', now);
    expect(d?.toISOString()).toBe('1990-03-15T00:00:00.000Z');
  });

  it('로컬 시간대와 무관하게 월·일이 밀리지 않는다', () => {
    // KST 로컬 생성이었다면 1990-03-14T15:00Z 가 되어 UTC 날짜가 14일로 밀린다.
    const d = parseBirthdayInput('1990-03-15', now)!;
    expect(d.getUTCMonth() + 1).toBe(3);
    expect(d.getUTCDate()).toBe(15);
  });

  it.each(['1990-3-15', '90-03-15', '1990/03/15', 'abc', '', '1990-03-15T00:00:00Z'])(
    '형식이 어긋나면 null: %s',
    (s) => expect(parseBirthdayInput(s, now)).toBeNull(),
  );

  it('존재하지 않는 날짜는 null — Date 가 조용히 다음 달로 넘기는 걸 막는다', () => {
    expect(parseBirthdayInput('1990-02-30', now)).toBeNull();
    expect(parseBirthdayInput('1990-13-01', now)).toBeNull();
    expect(parseBirthdayInput('1990-00-10', now)).toBeNull();
    expect(parseBirthdayInput('1990-04-31', now)).toBeNull();
  });

  it('윤년 2월 29일은 통과한다', () => {
    expect(parseBirthdayInput('2000-02-29', now)?.toISOString()).toBe('2000-02-29T00:00:00.000Z');
  });

  it('평년 2월 29일은 null', () => {
    expect(parseBirthdayInput('1999-02-29', now)).toBeNull();
  });

  it('미래 날짜는 null', () => {
    expect(parseBirthdayInput('2027-01-01', now)).toBeNull();
  });

  it('오늘은 통과한다 (경계)', () => {
    expect(parseBirthdayInput('2026-08-31', now)).not.toBeNull();
  });

  it('1900년 이전은 null, 1900-01-01 은 통과 (경계)', () => {
    expect(parseBirthdayInput('1899-12-31', now)).toBeNull();
    expect(parseBirthdayInput('1900-01-01', now)).not.toBeNull();
  });
});

describe('formatBirthdayInput', () => {
  it('UTC 기준으로 YYYY-MM-DD 를 만든다', () => {
    expect(formatBirthdayInput(utc('1990-03-15T00:00:00Z'))).toBe('1990-03-15');
  });

  it('한 자리 월·일을 0 으로 채운다', () => {
    expect(formatBirthdayInput(utc('2000-01-05T00:00:00Z'))).toBe('2000-01-05');
  });

  it('값이 없으면 빈 문자열 — input 의 value 로 바로 쓴다', () => {
    expect(formatBirthdayInput(null)).toBe('');
    expect(formatBirthdayInput(undefined)).toBe('');
  });

  it('parse 와 왕복한다', () => {
    const now = utc('2026-08-31T00:00:00Z');
    for (const s of ['1990-03-15', '2000-02-29', '1900-01-01', '2000-01-05']) {
      expect(formatBirthdayInput(parseBirthdayInput(s, now))).toBe(s);
    }
  });
});

describe('todayInSeoul', () => {
  it('UTC 15:00 이 KST 다음 날이다', () => {
    expect(todayInSeoul(utc('2026-03-14T15:00:00Z'))).toEqual({ year: 2026, month: 3, day: 15 });
  });

  it('UTC 14:59 는 아직 KST 같은 날이다', () => {
    expect(todayInSeoul(utc('2026-03-14T14:59:59Z'))).toEqual({ year: 2026, month: 3, day: 14 });
  });

  it('연 경계도 KST 로 넘어간다', () => {
    expect(todayInSeoul(utc('2026-12-31T15:00:00Z'))).toEqual({ year: 2027, month: 1, day: 1 });
  });
});

describe('isBirthdayToday', () => {
  const birthday = utc('1990-03-15T00:00:00Z');

  it('KST 로 생일 당일이면 true', () => {
    expect(isBirthdayToday(birthday, utc('2026-03-14T15:00:00Z'))).toBe(true);
  });

  it('아직 KST 전날이면 false', () => {
    expect(isBirthdayToday(birthday, utc('2026-03-14T14:00:00Z'))).toBe(false);
  });

  it('KST 로 다음 날이 되면 false', () => {
    expect(isBirthdayToday(birthday, utc('2026-03-15T15:00:00Z'))).toBe(false);
  });

  describe('2월 29일생', () => {
    const leapling = utc('2000-02-29T00:00:00Z');

    it('윤년에는 2월 29일에 축하한다', () => {
      expect(isBirthdayToday(leapling, utc('2028-02-29T03:00:00Z'))).toBe(true);
    });

    it('윤년의 3월 1일에는 축하하지 않는다 — 같은 해 두 번 터지면 안 된다', () => {
      expect(isBirthdayToday(leapling, utc('2028-03-01T03:00:00Z'))).toBe(false);
    });

    it('평년에는 3월 1일에 축하한다', () => {
      expect(isBirthdayToday(leapling, utc('2026-03-01T03:00:00Z'))).toBe(true);
    });

    it('평년의 2월 28일에는 축하하지 않는다', () => {
      expect(isBirthdayToday(leapling, utc('2026-02-28T03:00:00Z'))).toBe(false);
    });

    it('100 년 규칙: 2100 년은 평년이라 3월 1일', () => {
      expect(isBirthdayToday(leapling, utc('2100-03-01T03:00:00Z'))).toBe(true);
      expect(isBirthdayToday(leapling, utc('2100-02-28T03:00:00Z'))).toBe(false);
    });

    it('400 년 규칙: 2000 년은 윤년이라 2월 29일', () => {
      expect(isBirthdayToday(leapling, utc('2000-02-29T03:00:00Z'))).toBe(true);
      expect(isBirthdayToday(leapling, utc('2000-03-01T03:00:00Z'))).toBe(false);
    });
  });

  it('3월 1일생은 평년에도 3월 1일 하루만 — 윤년생과 겹쳐도 각자 판정한다', () => {
    expect(isBirthdayToday(utc('1990-03-01T00:00:00Z'), utc('2026-03-01T03:00:00Z'))).toBe(true);
    expect(isBirthdayToday(utc('1990-03-01T00:00:00Z'), utc('2026-02-28T03:00:00Z'))).toBe(false);
  });
});

describe('shouldCelebrate', () => {
  const birthday = utc('1990-03-15T00:00:00Z');
  const onBirthday = utc('2026-03-15T03:00:00Z');

  it('생일이고 올해 축하한 적이 없으면 true', () => {
    expect(shouldCelebrate(birthday, onBirthday, null)).toBe(true);
  });

  it('올해 이미 축하했으면 false', () => {
    expect(shouldCelebrate(birthday, onBirthday, '2026')).toBe(false);
  });

  it('작년에 축하한 표식은 올해를 막지 않는다', () => {
    expect(shouldCelebrate(birthday, onBirthday, '2025')).toBe(true);
  });

  it('생일이 아니면 표식과 무관하게 false', () => {
    expect(shouldCelebrate(birthday, utc('2026-07-01T03:00:00Z'), null)).toBe(false);
  });

  it('생일이 등록돼 있지 않으면 false', () => {
    expect(shouldCelebrate(null, onBirthday, null)).toBe(false);
    expect(shouldCelebrate(undefined, onBirthday, null)).toBe(false);
  });

  it('연말 KST 경계에서 연도는 KST 기준으로 센다', () => {
    // UTC 2026-12-31T15:00Z = KST 2027-01-01. 1월 1일생이면 2027 로 축하해야 한다.
    const newYearBaby = utc('1990-01-01T00:00:00Z');
    expect(shouldCelebrate(newYearBaby, utc('2026-12-31T15:00:00Z'), '2026')).toBe(true);
    expect(shouldCelebrate(newYearBaby, utc('2026-12-31T15:00:00Z'), '2027')).toBe(false);
  });
});

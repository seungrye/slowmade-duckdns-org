import { describe, it, expect } from 'vitest';
import { CATALOG, FALLBACK_ICON, decorate } from './catalog';
import type { EventKind } from './types';

describe('decorate', () => {
  it('표에 있는 이름은 아이콘과 설명을 붙인다', () => {
    const seollal = decorate('설날', 'holiday');
    expect(seollal.icon).toBe('🧧');
    expect(seollal.description).toContain('음력');
  });

  it('API 가 쓰는 이름을 별칭으로 받는다 — 신정은 "1월1일" 로 온다', () => {
    expect(decorate('1월1일', 'holiday')).toEqual(decorate('신정', 'holiday'));
    expect(decorate('1월1일', 'holiday').description).not.toBe('');
  });

  it('앞뒤 공백이 있어도 찾는다', () => {
    expect(decorate(' 추석 ', 'holiday').icon).toBe(decorate('추석', 'holiday').icon);
  });

  it.each<[EventKind, string]>([
    ['holiday', FALLBACK_ICON.holiday],
    ['anniversary', FALLBACK_ICON.anniversary],
    ['season', FALLBACK_ICON.season],
  ])('표에 없는 이름은 %s 기본 아이콘으로라도 보여준다', (kind, icon) => {
    const unknown = decorate('처음 보는 날', kind);
    expect(unknown.icon).toBe(icon);
    // 설명은 없어도 이름은 화면에 뜬다. 표에 없다고 사라지면 새 기념일이 조용히 샌다.
    expect(unknown.description).toBe('');
  });

  it('종류를 그대로 실어 보낸다 — 화면이 무게를 나눌 때 쓴다', () => {
    expect(decorate('동지', 'season').kind).toBe('season');
    expect(decorate('처음 보는 날', 'anniversary').kind).toBe('anniversary');
  });
});

describe('CATALOG 자체 점검', () => {
  const entries = Object.entries(CATALOG);

  it('모든 항목에 아이콘과 설명이 있다', () => {
    for (const [name, entry] of entries) {
      expect(entry.icon, `${name} 아이콘`).toBeTruthy();
      expect(entry.description.length, `${name} 설명`).toBeGreaterThan(5);
    }
  });

  it('아이콘이 서로 겹치지 않는다 — 아이콘만 보고 무슨 날인지 알 수 있어야 한다', () => {
    const icons = entries.map(([, e]) => e.icon);
    const duplicated = icons.filter((icon, i) => icons.indexOf(icon) !== i);
    expect([...new Set(duplicated)]).toEqual([]);
  });

  it('24절기가 모두 들어 있다', () => {
    const terms = [
      '입춘', '우수', '경칩', '춘분', '청명', '곡우',
      '입하', '소만', '망종', '하지', '소서', '대서',
      '입추', '처서', '백로', '추분', '한로', '상강',
      '입동', '소설', '대설', '동지', '소한', '대한',
    ];
    for (const term of terms) {
      expect(CATALOG[term], term).toBeDefined();
    }
  });

  it('법정공휴일이 모두 들어 있다', () => {
    const holidays = [
      '신정', '설날', '삼일절', '부처님오신날', '어린이날', '현충일',
      '광복절', '추석', '개천절', '한글날', '기독탄신일', '대체공휴일',
    ];
    for (const name of holidays) {
      expect(CATALOG[name], name).toBeDefined();
    }
  });
});

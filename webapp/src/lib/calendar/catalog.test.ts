import { describe, it, expect } from 'vitest';
import { CATALOG, FALLBACK_ICON, decorate, dedupeEvents, isWorthShowing } from './catalog';
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

  it('엔드포인트마다 띄어쓰기가 달라도 찾는다', () => {
    // 실측: 기념일은 '어버이 날'·'스승의 날'·'국군의 날' 처럼 띄어 쓴다.
    for (const [spaced, joined] of [
      ['어버이 날', '어버이날'],
      ['스승의 날', '스승의날'],
      ['국군의 날', '국군의날'],
      ['근로자의 날', '근로자의날'],
    ]) {
      const got = decorate(spaced, 'anniversary');
      expect(got.name, spaced).toBe(joined);
      expect(got.description, spaced).not.toBe('');
    }
  });

  it('대체공휴일은 괄호가 붙어 오는데, 아이콘은 찾고 이름은 원문을 살린다', () => {
    // 어느 공휴일의 대체인지가 정보라 이름을 뭉개면 안 된다.
    const got = decorate('대체공휴일(개천절)', 'holiday');
    expect(got.icon).toBe(decorate('대체공휴일', 'holiday').icon);
    expect(got.name).toBe('대체공휴일(개천절)');
    expect(got.description).not.toBe('');
  });

  it('같은 날을 엔드포인트마다 달리 불러도 하나로 모은다 — 노동절 = 근로자의 날', () => {
    expect(decorate('노동절', 'holiday').icon).toBe(decorate('근로자의 날', 'anniversary').icon);
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

describe('isWorthShowing', () => {
  it('설명이 있는 것만 띄운다', () => {
    expect(isWorthShowing(decorate('설날', 'holiday'))).toBe(true);
    expect(isWorthShowing(decorate('동지', 'season'))).toBe(true);
    // 기념일 82종 중 64종은 설명이 없다 — 다 띄우면 사흘에 한 번꼴이라 장식이 된다.
    expect(isWorthShowing(decorate('조달의 날', 'anniversary'))).toBe(false);
  });

  it('임시공휴일은 표에 있다 — 설명이 없으면 공휴일인데도 안 뜨기 때문', () => {
    expect(isWorthShowing(decorate('임시공휴일', 'holiday'))).toBe(true);
  });
});

describe('dedupeEvents', () => {
  it('같은 날 같은 이름이 두 번 오면 무게 높은 쪽만 남긴다', () => {
    // 실측(2026): 어린이날 5/5, 현충일 6/6 이 공휴일·기념일 양쪽에 있다.
    const merged = dedupeEvents([
      decorate('어린이 날', 'anniversary'),
      decorate('어린이날', 'holiday'),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].kind).toBe('holiday');
  });

  it('순서와 무관하게 같은 결과', () => {
    const a = dedupeEvents([decorate('현충일', 'holiday'), decorate('현충일', 'anniversary')]);
    const b = dedupeEvents([decorate('현충일', 'anniversary'), decorate('현충일', 'holiday')]);
    expect(a).toEqual(b);
    expect(a[0].kind).toBe('holiday');
  });

  it('공휴일이 앞, 절기가 뒤로 정렬된다 — 스택 맨 앞이 가장 중요한 날이어야 한다', () => {
    const sorted = dedupeEvents([
      decorate('백로', 'season'),
      decorate('어버이 날', 'anniversary'),
      decorate('설날', 'holiday'),
    ]);
    expect(sorted.map((e) => e.kind)).toEqual(['holiday', 'anniversary', 'season']);
  });

  it('다른 이름은 그대로 둔다', () => {
    const events = [decorate('백로', 'season'), decorate('동지', 'season')];
    expect(dedupeEvents(events)).toHaveLength(2);
  });
});

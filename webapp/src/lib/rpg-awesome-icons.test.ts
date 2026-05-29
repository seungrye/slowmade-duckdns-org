import { describe, it, expect } from 'vitest';
import { RPG_AWESOME_ICONS, formatCodepoint, parseCodepoint } from './rpg-awesome-icons';

describe('RPG_AWESOME_ICONS 데이터셋', () => {
  it('495 개 아이콘이 등록되어 있다 (RPG-Awesome 0.0.2)', () => {
    expect(RPG_AWESOME_ICONS.length).toBe(495);
  });

  it('모든 아이콘 codepoint 가 PUA 범위(U+E900..=U+EAEE)', () => {
    for (const i of RPG_AWESOME_ICONS) {
      expect(i.codepoint).toBeGreaterThanOrEqual(0xe900);
      expect(i.codepoint).toBeLessThanOrEqual(0xeaee);
    }
  });

  it('아이콘 이름이 유일하다', () => {
    const names = RPG_AWESOME_ICONS.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('이름은 모두 kebab-case (소문자/숫자/하이픈)', () => {
    for (const i of RPG_AWESOME_ICONS) {
      expect(i.name).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });

  it('대표 아이콘은 알려진 codepoint 와 일치한다', () => {
    const byName = new Map(RPG_AWESOME_ICONS.map((i) => [i.name, i.codepoint]));
    // RPG-Awesome 0.0.2 CSS 와 같은 매핑.
    expect(byName.get('broadsword')).toBe(0xe946);
    expect(byName.get('shield')).toBe(0xea96);
    expect(byName.get('potion')).toBe(0xea72);
    expect(byName.get('crossbow')).toBe(0xe978);
    expect(byName.get('spear-head')).toBe(0xeaac);
  });
});

describe('formatCodepoint / parseCodepoint round-trip', () => {
  it('formatCodepoint 는 대문자 hex 의 \\u{...} 리터럴을 생성한다', () => {
    expect(formatCodepoint(0xe946)).toBe('\\u{E946}');
    expect(formatCodepoint(0xeaee)).toBe('\\u{EAEE}');
  });

  it('parseCodepoint 는 \\u{...} 를 정수로 되돌린다', () => {
    expect(parseCodepoint('\\u{E946}')).toBe(0xe946);
    expect(parseCodepoint('\\u{eaee}')).toBe(0xeaee);
  });

  it('parseCodepoint 는 형식이 아니면 null 을 반환한다', () => {
    expect(parseCodepoint('')).toBeNull();
    expect(parseCodepoint('A')).toBeNull();
    expect(parseCodepoint('\\uE946')).toBeNull(); // 중괄호 없음
    expect(parseCodepoint('\\u{ZZZ}')).toBeNull();
  });

  it('round-trip: 모든 등록 codepoint 가 format → parse 로 원복된다', () => {
    for (const i of RPG_AWESOME_ICONS) {
      expect(parseCodepoint(formatCodepoint(i.codepoint))).toBe(i.codepoint);
    }
  });
});

// #250 - the stigma contamination debuff plus the automatic petrification branch.
//
// The stages (mapping the external AI design):
//   0-49 : normal.
//   50-79: debuffed - con/dex checks take -2. Selene's magic checks take +3.
//   80-99: critical - the debuff continues (the UI warning is separate).
//   100+ : moves to the automatic petrification ending.

import { describe, it, expect } from 'vitest';
import { stigmaDebuff, applyStigmaDelta, isFullyPetrified } from './stigma';
import type { Character } from '@/types/web-adventure';

function makeCharacter(stigmaErosion: number): Character {
  return {
    stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
    hp: 10,
    maxHp: 10,
    ability: 'lunar',
    protagonist: 'kael',
    stigmaErosion,
    inventory: [],
    flags: {},
    rerollsLeft: 3,
  };
}

describe('stigmaDebuff', () => {
  it('침식도 0-49: 디버프 없음', () => {
    expect(stigmaDebuff(makeCharacter(0), 'con')).toBe(0);
    expect(stigmaDebuff(makeCharacter(49), 'dex')).toBe(0);
    expect(stigmaDebuff(makeCharacter(30), 'str')).toBe(0);
  });

  it('침식도 50-79: con/dex 판정 -2', () => {
    expect(stigmaDebuff(makeCharacter(50), 'con')).toBe(-2);
    expect(stigmaDebuff(makeCharacter(79), 'dex')).toBe(-2);
    expect(stigmaDebuff(makeCharacter(60), 'str')).toBe(0); // str is unaffected
    expect(stigmaDebuff(makeCharacter(60), 'int')).toBe(0);
  });

  it('침식도 80+: 임계 단계도 con/dex -2 유지', () => {
    expect(stigmaDebuff(makeCharacter(80), 'con')).toBe(-2);
    expect(stigmaDebuff(makeCharacter(95), 'dex')).toBe(-2);
  });
});

describe('applyStigmaDelta', () => {
  it('양수 delta: 침식도 증가', () => {
    const c = applyStigmaDelta(makeCharacter(50), 3);
    expect(c.stigmaErosion).toBe(53);
  });

  it('음수 delta: 침식도 감소', () => {
    const c = applyStigmaDelta(makeCharacter(50), -2);
    expect(c.stigmaErosion).toBe(48);
  });

  it('0 미만 clamp', () => {
    const c = applyStigmaDelta(makeCharacter(2), -10);
    expect(c.stigmaErosion).toBe(0);
  });

  it('100 초과 시 100 으로 clamp', () => {
    const c = applyStigmaDelta(makeCharacter(95), 10);
    expect(c.stigmaErosion).toBe(100);
  });

  // #290 - guarding against NaN and Infinity.
  it('character.stigmaErosion 이 NaN 이면 0 으로 정규화 (delta 적용)', () => {
    const c = applyStigmaDelta(makeCharacter(NaN), 5);
    expect(c.stigmaErosion).toBe(5);
  });

  it('delta 가 NaN 이면 0 으로 적용 (현재값 보존)', () => {
    const c = applyStigmaDelta(makeCharacter(50), NaN);
    expect(c.stigmaErosion).toBe(50);
  });

  it('Infinity character + Infinity delta → 0 (양쪽 차단)', () => {
    const c = applyStigmaDelta(makeCharacter(Infinity), Infinity);
    expect(c.stigmaErosion).toBe(0);
  });
});

describe('isFullyPetrified', () => {
  it('침식도 100 → true', () => {
    expect(isFullyPetrified(makeCharacter(100))).toBe(true);
  });
  it('침식도 99 → false', () => {
    expect(isFullyPetrified(makeCharacter(99))).toBe(false);
  });
  it('침식도 0 → false', () => {
    expect(isFullyPetrified(makeCharacter(0))).toBe(false);
  });
});

// #250 — 성흔 침식 디버프 + 자동 petrification 분기.
//
// 단계 (외부 AI 기획안 매핑):
//   0-49 : 정상.
//   50-79: 디버프 — con/dex 판정 -2. 셀레네(selene) 마법 판정 +3.
//   80-99: 임계 — 디버프 유지 (UI 경고는 별도).
//   100+: 자동 petrification 엔딩 전환.

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
    expect(stigmaDebuff(makeCharacter(60), 'str')).toBe(0); // str 영향 없음
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

  // #290 — NaN/Infinity 방어.
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

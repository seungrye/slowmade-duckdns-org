// Derived variables for feeling the contamination (#370).
import { describe, it, expect } from 'vitest';
import { stigmaTier, stigmaVars } from './stigma-sense';
import { interpolate } from './script';

describe('stigmaTier', () => {
  it('25 간격으로 다섯 단계 — 기존 침식 게이트와 경계를 맞춘다', () => {
    expect(stigmaTier(0)).toBe(0);
    expect(stigmaTier(24)).toBe(0);
    expect(stigmaTier(25)).toBe(1);
    expect(stigmaTier(49)).toBe(1);
    expect(stigmaTier(50)).toBe(2);
    expect(stigmaTier(75)).toBe(3);
    expect(stigmaTier(100)).toBe(4);
  });

  it('범위를 벗어난 값도 안전하다', () => {
    expect(stigmaTier(-10)).toBe(0);
    expect(stigmaTier(999)).toBe(4);
    expect(stigmaTier(NaN)).toBe(0);
  });
});

describe('stigmaVars', () => {
  it('감각별 변수를 모두 준다', () => {
    const v = stigmaVars(0);
    expect(Object.keys(v).sort()).toEqual(
      ['침식_마음', '침식_손', '침식_숨', '침식_시야', '침식단계'].sort(),
    );
  });

  // This is the whole feature - the same sentence must read with a different weight each run.
  it('침식이 오르면 문장이 달라진다', () => {
    const low = stigmaVars(0);
    const high = stigmaVars(100);
    for (const k of ['침식_손', '침식_시야', '침식_숨', '침식_마음']) {
      expect(high[k]).not.toBe(low[k]);
      expect(high[k].length).toBeGreaterThan(0);
    }
  });

  it('같은 단계면 같은 문장 — 문단마다 흔들리지 않는다', () => {
    expect(stigmaVars(80)).toEqual(stigmaVars(99));
  });

  it('단계 값도 함께 준다 — 작가가 직접 쓸 수 있게', () => {
    expect(stigmaVars(50)['침식단계']).toBe('2');
  });

  // The real use: a variable placed in the body is substituted as it stands.
  it('본문 보간에 그대로 물린다', () => {
    const line = '너는 문고리를 잡는다. {{침식_손}}';
    expect(interpolate(line, stigmaVars(0))).toContain('시리다');
    expect(interpolate(line, stigmaVars(100))).toContain('손등으로');
    expect(interpolate(line, stigmaVars(100))).not.toContain('{{');
  });

  it('작가가 직접 정한 변수를 덮어쓰지 않는다 — 병합 순서는 호출측 몫', () => {
    const authored = { 침식_손: '작가가 쓴 문장' };
    const merged = { ...stigmaVars(100), ...authored };
    expect(merged['침식_손']).toBe('작가가 쓴 문장');
  });
});

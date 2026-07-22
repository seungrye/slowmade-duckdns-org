import { describe, expect, it } from 'vitest';
import { formatNumber, formatMoney } from '../format';

describe('formatNumber', () => {
  it('returns plain number for values under 1000', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
  });

  it('formats thousands with one decimal when needed', () => {
    expect(formatNumber(1000)).toBe('1k');
    expect(formatNumber(1500)).toBe('1.5k');
    expect(formatNumber(11000)).toBe('11k');
  });

  it('formats millions with one decimal when needed', () => {
    expect(formatNumber(1_000_000)).toBe('1m');
    expect(formatNumber(2_500_000)).toBe('2.5m');
  });

  it('formats billions with one decimal when needed', () => {
    expect(formatNumber(1_000_000_000)).toBe('1b');
    expect(formatNumber(2_750_000_000)).toBe('2.8b');
  });
});

describe('formatMoney', () => {
  it('kr: 정수 반올림 + 천단위 쉼표 + 원', () => {
    expect(formatMoney(6956825, 'kr')).toBe('6,956,825원');
    expect(formatMoney(128000.36, 'kr')).toBe('128,000원'); // 원 단위 반올림(소수점 제거)
    expect(formatMoney(999, 'kr')).toBe('999원'); // 1000 미만 쉼표 없음
    expect(formatMoney(0, 'kr')).toBe('0원');
  });

  it('us: 소수 2자리 + 천단위 쉼표 + $', () => {
    expect(formatMoney(128000.36, 'us')).toBe('$128,000.36');
    expect(formatMoney(45.6, 'us')).toBe('$45.60');
    expect(formatMoney(999.5, 'us')).toBe('$999.50'); // 1000 미만 쉼표 없음
  });

  it('음수(실현손익 손실 등) 부호 유지', () => {
    expect(formatMoney(-1234, 'kr')).toBe('-1,234원');
    expect(formatMoney(-12.34, 'us')).toBe('-$12.34');
  });
});

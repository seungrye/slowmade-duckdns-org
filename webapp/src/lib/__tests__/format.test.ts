import { describe, expect, it } from 'vitest';
import { formatNumber } from '../format';

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

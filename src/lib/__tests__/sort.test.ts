import { describe, expect, it } from 'vitest';
import { isValidSortOption, SORT_LABELS, SortOptionSchema } from '../sort';

describe('sort utilities', () => {
  it('validates allowed sort options', () => {
    expect(isValidSortOption('latest')).toBe(true);
    expect(isValidSortOption('popular')).toBe(true);
    expect(isValidSortOption('commented')).toBe(true);
    expect(isValidSortOption('invalid')).toBe(false);
    expect(isValidSortOption(undefined)).toBe(false);
  });

  it('provides correct labels for each sort option', () => {
    expect(SORT_LABELS.latest).toBe('최신순');
    expect(SORT_LABELS.popular).toBe('인기순');
    expect(SORT_LABELS.commented).toBe('댓글 많은 순');
  });

  it('parses valid sort values using Zod schema', () => {
    expect(SortOptionSchema.parse('latest')).toBe('latest');
    expect(SortOptionSchema.parse('popular')).toBe('popular');
    expect(SortOptionSchema.parse('commented')).toBe('commented');
  });
});

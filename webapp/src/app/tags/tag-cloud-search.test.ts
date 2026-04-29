import { describe, expect, it } from 'vitest';
import { filterTags, getTagSize } from './tag-cloud-search.helpers';

type TagInfo = {
  tag: string;
  count: number;
};

const tags: TagInfo[] = [
  { tag: 'funny', count: 15 },
  { tag: 'react', count: 8 },
  { tag: 'nextjs', count: 4 },
  { tag: 'Typescript', count: 10 },
];

describe('TagCloudSearch helpers', () => {
  it('returns all tags when query is blank', () => {
    expect(filterTags(tags, '')).toEqual(tags);
    expect(filterTags(tags, '   ')).toEqual(tags);
  });

  it('filters tags case-insensitively', () => {
    expect(filterTags(tags, 'next')).toEqual([{ tag: 'nextjs', count: 4 }]);
    expect(filterTags(tags, 'TYPE')).toEqual([{ tag: 'Typescript', count: 10 }]);
  });

  it('supports partial matches', () => {
    expect(filterTags(tags, 't')).toEqual([
      { tag: 'react', count: 8 },
      { tag: 'nextjs', count: 4 },
      { tag: 'Typescript', count: 10 },
    ]);
  });

  it('returns the baseline size when all counts are equal', () => {
    expect(getTagSize(3, 3, 3)).toBe(1.1);
  });

  it('normalizes sizes between min and max counts', () => {
    expect(getTagSize(8, 4, 15)).toBeCloseTo(0.95 + ((8 - 4) / (15 - 4)) * 1.2);
    expect(getTagSize(15, 4, 15)).toBeCloseTo(2.15);
    expect(getTagSize(4, 4, 15)).toBeCloseTo(0.95);
  });
});

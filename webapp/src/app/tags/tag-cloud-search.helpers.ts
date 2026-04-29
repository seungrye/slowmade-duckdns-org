export type TagInfo = {
  tag: string;
  count: number;
};

export function getTagSize(count: number, minCount: number, maxCount: number) {
  if (minCount === maxCount) {
    return 1.1;
  }

  const normalized = (count - minCount) / (maxCount - minCount);
  return 0.95 + normalized * 1.2;
}

export function filterTags(initialTags: TagInfo[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return initialTags;
  }

  return initialTags.filter((item) => item.tag.toLowerCase().includes(normalizedQuery));
}

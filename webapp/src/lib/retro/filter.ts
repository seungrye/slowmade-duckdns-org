// Filtering the library list (#109) - pure functions. The same approach as `tags/tag-cloud-search.helpers.ts`.

import type { GameEntry } from './entry';
import { PLATFORMS, type PlatformId } from './platforms';

export type PlatformFilter = PlatformId | 'all';

/**
 * Filters by platform and search term.
 *
 * With nothing to filter it **returns the array it was given** - the reference must be preserved so useMemo does not spin needlessly.
 */
export function filterGames(
  games: GameEntry[],
  platform: PlatformFilter,
  query: string,
): GameEntry[] {
  const q = query.trim().toLowerCase();
  if (platform === 'all' && !q) return games;
  return games.filter((g) => {
    if (platform !== 'all' && g.platform !== platform) return false;
    if (q && !g.title.toLowerCase().includes(q)) return false;
    return true;
  });
}

export type PlatformCounts = Record<PlatformFilter, number>;

/** For the sidebar badges - every platform key is always present (even at 0). */
export function countByPlatform(games: GameEntry[]): PlatformCounts {
  const counts = { all: games.length } as PlatformCounts;
  for (const p of PLATFORMS) counts[p.id] = 0;
  for (const g of games) counts[g.platform] = (counts[g.platform] ?? 0) + 1;
  return counts;
}

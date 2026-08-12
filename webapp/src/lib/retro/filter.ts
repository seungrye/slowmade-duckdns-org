// 라이브러리 목록 거르기 (#109) — 순수 함수. `tags/tag-cloud-search.helpers.ts` 와 같은 방식.

import type { GameEntry } from './entry';
import { PLATFORMS, type PlatformId } from './platforms';

export type PlatformFilter = PlatformId | 'all';

/**
 * 플랫폼 + 검색어로 거른다.
 *
 * 거를 게 없으면 **받은 배열을 그대로 돌려준다** — 참조가 유지되어야 useMemo 가 헛돌지 않는다.
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

/** 사이드바 배지용 — 모든 플랫폼 키가 항상 존재한다(0 이라도). */
export function countByPlatform(games: GameEntry[]): PlatformCounts {
  const counts = { all: games.length } as PlatformCounts;
  for (const p of PLATFORMS) counts[p.id] = 0;
  for (const g of games) counts[g.platform] = (counts[g.platform] ?? 0) + 1;
  return counts;
}

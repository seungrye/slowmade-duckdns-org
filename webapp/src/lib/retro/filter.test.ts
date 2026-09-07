import { describe, it, expect } from 'vitest';
import { countByPlatform, filterGames } from './filter';
import type { GameEntry } from './entry';

function entry(over: Partial<GameEntry>): GameEntry {
  return {
    key: 'builtin:x',
    source: 'builtin',
    id: 'x',
    title: 'X',
    platform: 'snes',
    romUrl: '/games/retro/roms/x.sfc',
    playHref: '/games/retro/play/builtin/x',
    ...over,
  };
}

const GAMES: GameEntry[] = [
  entry({ key: 'a', id: 'a', title: 'Lan Master', platform: 'snes' }),
  entry({ key: 'b', id: 'b', title: 'Alter Ego', platform: 'snes' }),
  entry({ key: 'c', id: 'c', title: 'Uwol', platform: 'arcade' }),
  entry({ key: 'd', id: 'd', title: '내 롬 파일', platform: 'arcade', source: 'rom' }),
];

describe('retro/filter', () => {
  it('빈 질의·전체 플랫폼이면 원본을 그대로 준다', () => {
    // The reference must be preserved so useMemo does not spin needlessly.
    expect(filterGames(GAMES, 'all', '')).toBe(GAMES);
    expect(filterGames(GAMES, 'all', '   ')).toBe(GAMES);
  });

  it('플랫폼으로 거른다', () => {
    expect(filterGames(GAMES, 'snes', '').map((g) => g.id)).toEqual(['a', 'b']);
    expect(filterGames(GAMES, 'arcade', '').map((g) => g.id)).toEqual(['c', 'd']);
  });

  it('제목 검색은 대소문자를 가리지 않는다', () => {
    expect(filterGames(GAMES, 'all', 'lan').map((g) => g.id)).toEqual(['a']);
    expect(filterGames(GAMES, 'all', 'ALTER').map((g) => g.id)).toEqual(['b']);
  });

  it('한글 제목도 검색된다', () => {
    expect(filterGames(GAMES, 'all', '내 롬').map((g) => g.id)).toEqual(['d']);
  });

  it('플랫폼과 검색을 함께 적용한다', () => {
    // 'ego' appears only in the NES Alter Ego.
    expect(filterGames(GAMES, 'snes', 'ego').map((g) => g.id)).toEqual(['b']);
    // A matching search term still drops out on a different platform.
    expect(filterGames(GAMES, 'arcade', 'ego')).toEqual([]);
  });

  it('countByPlatform 이 전체와 플랫폼별 개수를 센다', () => {
    const counts = countByPlatform(GAMES);
    expect(counts.all).toBe(4);
    expect(counts.snes).toBe(2);
    expect(counts.arcade).toBe(2);
  });
});

import { describe, it, expect } from 'vitest';
import { countByPlatform, filterGames } from './filter';
import type { GameEntry } from './entry';

function entry(over: Partial<GameEntry>): GameEntry {
  return {
    key: 'builtin:x',
    source: 'builtin',
    id: 'x',
    title: 'X',
    platform: 'nes',
    romUrl: '/games/retro/roms/x.nes',
    playHref: '/games/retro/play/builtin/x',
    ...over,
  };
}

const GAMES: GameEntry[] = [
  entry({ key: 'a', id: 'a', title: 'Lan Master', platform: 'nes' }),
  entry({ key: 'b', id: 'b', title: 'Alter Ego', platform: 'nes' }),
  entry({ key: 'c', id: 'c', title: 'Uwol', platform: 'snes' }),
  entry({ key: 'd', id: 'd', title: '내 롬 파일', platform: 'gba', source: 'rom' }),
];

describe('retro/filter', () => {
  it('빈 질의·전체 플랫폼이면 원본을 그대로 준다', () => {
    // 참조가 유지되어야 useMemo 가 헛돌지 않는다.
    expect(filterGames(GAMES, 'all', '')).toBe(GAMES);
    expect(filterGames(GAMES, 'all', '   ')).toBe(GAMES);
  });

  it('플랫폼으로 거른다', () => {
    expect(filterGames(GAMES, 'nes', '').map((g) => g.id)).toEqual(['a', 'b']);
    expect(filterGames(GAMES, 'md', '')).toEqual([]);
  });

  it('제목 검색은 대소문자를 가리지 않는다', () => {
    expect(filterGames(GAMES, 'all', 'lan').map((g) => g.id)).toEqual(['a']);
    expect(filterGames(GAMES, 'all', 'ALTER').map((g) => g.id)).toEqual(['b']);
  });

  it('한글 제목도 검색된다', () => {
    expect(filterGames(GAMES, 'all', '내 롬').map((g) => g.id)).toEqual(['d']);
  });

  it('플랫폼과 검색을 함께 적용한다', () => {
    // 'ego' 는 NES 의 Alter Ego 에만 있다.
    expect(filterGames(GAMES, 'nes', 'ego').map((g) => g.id)).toEqual(['b']);
    // 검색어가 맞아도 플랫폼이 다르면 빠진다.
    expect(filterGames(GAMES, 'snes', 'ego')).toEqual([]);
  });

  it('countByPlatform 이 전체와 플랫폼별 개수를 센다', () => {
    const counts = countByPlatform(GAMES);
    expect(counts.all).toBe(4);
    expect(counts.nes).toBe(2);
    expect(counts.snes).toBe(1);
    expect(counts.md).toBe(0);
  });
});

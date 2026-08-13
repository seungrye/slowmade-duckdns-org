import { describe, it, expect } from 'vitest';
import {
  BUILTIN_GAMES,
  builtinBySlug,
  filterExistingBuiltins,
  withExistingCovers,
} from './library';
import { PLATFORMS, platformById } from './platforms';

describe('retro/library — 기본 제공 홈브류 목록', () => {
  it('slug 가 중복되지 않는다', () => {
    const slugs = BUILTIN_GAMES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('롬 파일명도 중복되지 않는다 — 같은 파일을 두 항목이 가리키면 받아올 때 덮어쓴다', () => {
    const files = BUILTIN_GAMES.map((g) => g.file);
    expect(new Set(files).size).toBe(files.length);
  });

  it('모든 항목이 지원 기종이고 출처·라이선스를 밝힌다', () => {
    for (const g of BUILTIN_GAMES) {
      expect(platformById(g.platform), `${g.slug} platform`).toBeDefined();
      // 출처를 안 밝힌 롬을 무심코 얹지 못하게 한다 — 저작권은 실수하면 되돌리기 어렵다.
      expect(g.source, `${g.slug} source`).toMatch(/^https?:\/\//);
      expect(g.license, `${g.slug} license`).toBeTruthy();
    }
  });

  it('파일 확장자가 그 기종이 아는 것이거나, md 처럼 .bin 을 쓴다', () => {
    for (const g of BUILTIN_GAMES) {
      const meta = platformById(g.platform)!;
      const ext = g.file.slice(g.file.lastIndexOf('.')).toLowerCase();
      const known = meta.extensions.includes(ext) || ext === '.bin';
      expect(known, `${g.slug} (${ext}) 가 ${g.platform} 에 맞지 않는다`).toBe(true);
    }
  });

  // #139 — 아케이드(FBNeo)는 자유 배포 롬셋이 없어 기본 제공이 비어 있다. 사용자가 올려서 쓴다.
  it('기종마다 많아야 하나 — 목록이 무심코 불어나지 않게', () => {
    for (const p of PLATFORMS) {
      const n = BUILTIN_GAMES.filter((g) => g.platform === p.id).length;
      expect(n, `${p.id}`).toBeLessThanOrEqual(1);
    }
  });

  it('builtinBySlug', () => {
    expect(builtinBySlug('super-boss-gaiden')?.platform).toBe('snes');
    expect(builtinBySlug('없는-게임')).toBeUndefined();
  });

  describe('filterExistingBuiltins — 안 받아진 롬은 감춘다', () => {
    it('파일이 있는 것만 남는다', () => {
      const only = BUILTIN_GAMES[0];
      const kept = filterExistingBuiltins(BUILTIN_GAMES, (p) => p === `roms/${only.file}`);
      expect(kept).toEqual([only]);
    });

    it('하나도 없으면 빈 목록 — 화면은 안내를 띄운다', () => {
      expect(filterExistingBuiltins(BUILTIN_GAMES, () => false)).toEqual([]);
    });
  });

  describe('withExistingCovers — 커버만 없으면 카드는 살리고 그림만 뗀다', () => {
    it('커버가 없으면 cover 를 지운다', () => {
      const out = withExistingCovers(BUILTIN_GAMES, (p) => p.startsWith('roms/'));
      expect(out.every((g) => g.cover === undefined)).toBe(true);
      expect(out).toHaveLength(BUILTIN_GAMES.length);
    });

    it('커버가 있으면 원본을 그대로 둔다', () => {
      const out = withExistingCovers(BUILTIN_GAMES, () => true);
      expect(out[0]).toBe(BUILTIN_GAMES[0]);
    });
  });
});

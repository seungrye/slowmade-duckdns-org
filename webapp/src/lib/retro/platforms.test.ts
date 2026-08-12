import { describe, it, expect } from 'vitest';
import {
  PLATFORMS,
  SUPPORTED_CORES,
  platformById,
  platformForFilename,
  type PlatformId,
} from './platforms';

describe('retro/platforms', () => {
  it('플랫폼 id 가 중복되지 않는다', () => {
    const ids = PLATFORMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 플랫폼이 EmulatorJS 코어와 확장자를 갖는다', () => {
    for (const p of PLATFORMS) {
      expect(p.core, `${p.id} core`).toBeTruthy();
      expect(p.extensions.length, `${p.id} extensions`).toBeGreaterThan(0);
      // 확장자는 소문자 점 포함 형식으로 통일 — platformForFilename 이 이 규칙에 의존한다.
      for (const ext of p.extensions) expect(ext).toMatch(/^\.[a-z0-9]+$/);
    }
  });

  it('SUPPORTED_CORES 가 플랫폼 목록에서 파생된다', () => {
    for (const p of PLATFORMS) expect(SUPPORTED_CORES.has(p.core)).toBe(true);
    expect(SUPPORTED_CORES.has('psx')).toBe(false); // BIOS 저작권 — 이번 범위 밖
  });

  it('platformById 는 없는 id 에 undefined 를 준다', () => {
    expect(platformById('nes')?.label).toBe('NES');
    expect(platformById('n64' as PlatformId)).toBeUndefined();
  });

  describe('platformForFilename — 확장자로 플랫폼 추론', () => {
    it.each([
      ['SuperMario.nes', 'nes'],
      ['zelda.SFC', 'snes'],
      ['tetris.gb', 'gb'],
      ['pokemon.gbc', 'gb'],
      ['metroid.gba', 'gba'],
      ['sonic.md', 'md'],
      ['sonic.gen', 'md'],
    ])('%s → %s', (filename, expected) => {
      expect(platformForFilename(filename)?.id).toBe(expected);
    });

    it('알 수 없는 확장자는 undefined — 사용자가 직접 고르게 한다', () => {
      expect(platformForFilename('save.zip')).toBeUndefined();
      expect(platformForFilename('noext')).toBeUndefined();
      expect(platformForFilename('')).toBeUndefined();
    });

    it('.bin 은 추론하지 않는다 — 여러 기종이 공유하는 확장자라 오추론이 더 나쁘다', () => {
      expect(platformForFilename('game.bin')).toBeUndefined();
    });
  });
});

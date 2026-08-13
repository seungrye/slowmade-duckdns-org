import { describe, it, expect } from 'vitest';
import {
  PLATFORMS,
  SUPPORTED_CORES,
  platformById,
  platformForFilename,
  isArcade,
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
    expect(SUPPORTED_CORES.has('psx')).toBe(false); // 지원 목록 밖
  });

  it('platformById 는 없는 id 에 undefined 를 준다', () => {
    expect(platformById('snes')?.label).toBe('SNES');
    expect(platformById('n64' as PlatformId)).toBeUndefined();
  });

  describe('platformForFilename — 확장자로 플랫폼 추론', () => {
    it.each([
      ['zelda.SFC', 'snes'],
      ['tales.sfc', 'snes'],
      ['chrono.smc', 'snes'],
      // 아케이드 롬셋은 zip 묶음이다 (#139).
      ['ssf2t.zip', 'cps2'],
    ])('%s → %s', (filename, expected) => {
      expect(platformForFilename(filename)?.id).toBe(expected);
    });

    it('알 수 없는 확장자는 undefined — 사용자가 직접 고르게 한다', () => {
      expect(platformForFilename('noext')).toBeUndefined();
      expect(platformForFilename('')).toBeUndefined();
      expect(platformForFilename('game.nes')).toBeUndefined(); // 이제 지원하지 않는 기종
    });

    it('.bin 은 추론하지 않는다 — 여러 기종이 공유하는 확장자라 오추론이 더 나쁘다', () => {
      expect(platformForFilename('game.bin')).toBeUndefined();
    });
  });

  // #139 — 아케이드만 파일명이 게임 식별자라 다르게 다뤄야 한다.
  describe('isArcade', () => {
    it('CPS2 만 아케이드다', () => {
      expect(isArcade('cps2')).toBe(true);
      expect(isArcade('snes')).toBe(false);
      expect(isArcade(undefined)).toBe(false);
    });
  });
});

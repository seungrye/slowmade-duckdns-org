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
      ['ssf2t.zip', 'arcade'],
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
    it('아케이드 기종만 참이다', () => {
      expect(isArcade('arcade')).toBe(true);
      expect(isArcade('snes')).toBe(false);
      expect(isArcade(undefined)).toBe(false);
    });
  });

  // #151 — 아케이드를 FBNeo 로 **교체**했다(CPS2 전용 fbalpha2012 제거). 두 코어의 차이:
  // fbalpha2012 는 키를 내장하지만 수정된 롬을 CRC 로 거부하고, FBNeo 는 롬셋에 .key 를
  // 요구하는 대신 patched 경로의 롬을 이름으로 받아 준다(= 런타임 한글패치 가능).
  describe('FBNeo 기종 (#151)', () => {
    it('arcade 기종이 fbneo 코어로 등록돼 있다', () => {
      const p = platformById('arcade');
      expect(p?.core).toBe('fbneo');
      expect(p?.extensions).toContain('.zip');
    });

    it('CPS2 전용 코어는 더 쓰지 않는다 — 패치가 원천적으로 불가능했다 (#150)', () => {
      expect(platformById('cps2')).toBeUndefined();
      expect(SUPPORTED_CORES.has('fbalpha2012_cps2')).toBe(false);
    });

    it('아케이드로 취급된다 — 파일명이 곧 롬셋 이름이다', () => {
      expect(isArcade('arcade')).toBe(true);
      expect(isArcade('snes')).toBe(false);
    });

    it('아케이드 여부는 배열에서 파생된다 — 새 아케이드 코어를 넣어도 따라온다', () => {
      for (const p of PLATFORMS) expect(isArcade(p.id)).toBe(p.arcade === true);
    });
  });

  // #156 — GBA 추가. 아케이드와 달리 파일 하나로 끝나고 BIOS 도 필요 없다(mGBA 는 HLE).
  describe('GBA 기종 (#156)', () => {
    it('gba 기종이 mgba 코어로 등록돼 있다', () => {
      const p = platformById('gba');
      expect(p?.core).toBe('mgba');
      expect(p?.extensions).toContain('.gba');
    });

    it('확장자로 추론된다 — 다른 기종과 겹치지 않는다', () => {
      expect(platformForFilename('pokemon.gba')?.id).toBe('gba');
      expect(platformForFilename('POKEMON.GBA')?.id).toBe('gba');
    });

    it('아케이드가 아니다 — 파일명이 게임 식별자가 아니다', () => {
      expect(isArcade('gba')).toBe(false);
    });
  });
});

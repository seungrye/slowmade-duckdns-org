// The filename to hand the core for a merged and patched ROM (#148).
//
// It loads the deployed file as is - the very one player.js imports.
import { describe, it, expect } from 'vitest';
import {
  PATCHED_ROM_DIR,
  patchedRomPath,
  romFileNameFromUrl,
} from '../../../public/games/retro/rom-name.js';

describe('romFileNameFromUrl', () => {
  // The heart of #148 - on arcade **the filename is the ROM set's name**. Get it wrong and the core cannot find the
  // ROM, showing the settings screen instead of the game.
  it('아케이드: 주소의 마지막 조각을 그대로 살린다', () => {
    expect(romFileNameFromUrl('/api/games/retro/roms/abc123/file/ddsoma.zip', 'zip')).toBe(
      'ddsoma.zip',
    );
  });

  it('SNES: 캐시 키용으로 붙인 id 이름도 그대로 쓴다', () => {
    expect(romFileNameFromUrl('/api/games/retro/roms/abc123/file/abc123.sfc', 'sfc')).toBe(
      'abc123.sfc',
    );
  });

  it('기본 제공 롬의 정적 경로도 다룬다', () => {
    expect(romFileNameFromUrl('/games/retro/roms/superbossgaiden.sfc', 'sfc')).toBe(
      'superbossgaiden.sfc',
    );
  });

  it('쿼리와 프래그먼트는 떼어 낸다', () => {
    expect(romFileNameFromUrl('/x/ddsoma.zip?v=2', 'zip')).toBe('ddsoma.zip');
    expect(romFileNameFromUrl('/x/ddsoma.zip#frag', 'zip')).toBe('ddsoma.zip');
  });

  it('퍼센트 인코딩을 푼다 — 주소에는 인코딩된 이름이 실린다', () => {
    expect(romFileNameFromUrl('/x/Super%20Mario%20World.sfc', 'sfc')).toBe(
      'Super Mario World.sfc',
    );
  });

  it('확장자가 없으면 코어에 맞는 것을 붙인다', () => {
    expect(romFileNameFromUrl('/api/games/retro/roms/abc/file/abc', 'sfc')).toBe('abc.sfc');
  });

  it('이름을 못 뽑으면 안전한 기본값', () => {
    expect(romFileNameFromUrl('', 'zip')).toBe('game.zip');
    expect(romFileNameFromUrl('/x/', 'zip')).toBe('game.zip');
    // The types say it cannot happen, but at run time it does - undefined slips in when the address assembly goes wrong.
    expect(romFileNameFromUrl(null as unknown as string, 'bin')).toBe('game.bin');
  });

  // This name becomes the writeFile path in the emulator's virtual filesystem verbatim.
  it('경로 구분자는 남기지 않는다 — 파일시스템을 벗어나지 못하게', () => {
    const out = romFileNameFromUrl('/x/%2E%2E%2Fevil.zip', 'zip');
    expect(out).not.toContain('/');
    expect(out).not.toContain('\\');
  });

  it('망가진 퍼센트 이스케이프에도 던지지 않는다', () => {
    expect(() => romFileNameFromUrl('/x/%E0%A4%A.zip', 'zip')).not.toThrow();
    expect(romFileNameFromUrl('/x/%E0%A4%A.zip', 'zip')).toBeTruthy();
  });
});

// #151 - FBNeo looks at `<system>/fbneo/patched/<set>` first and accepts a ROM from there **by name even with a
// different CRC** (only warning). The feature exists for translation patches. Placed at the root (`/`) it fails the
// CRC check and loading fails with `ROM at index N ... is required`.
describe('patchedRomPath', () => {
  it('FBNeo 는 patched 경로에 놓는다', () => {
    expect(patchedRomPath('fbneo', 'ddsoma.zip')).toBe('/fbneo/patched/ddsoma.zip');
    expect(PATCHED_ROM_DIR).toBe('/fbneo/patched');
  });

  it('다른 코어는 patched 경로를 쓰지 않는다 — 그런 규약이 없다', () => {
    expect(patchedRomPath('fbalpha2012_cps2', 'ddsoma.zip')).toBeNull();
    expect(patchedRomPath('snes9x', 'a.sfc')).toBeNull();
    expect(patchedRomPath('', 'a.zip')).toBeNull();
  });

  it('경로 조각이 섞인 이름은 파일명만 남긴다', () => {
    expect(patchedRomPath('fbneo', 'a/b/ddsoma.zip')).toBe('/fbneo/patched/ddsoma.zip');
  });
});

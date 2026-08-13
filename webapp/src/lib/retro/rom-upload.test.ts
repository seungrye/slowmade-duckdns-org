import { describe, it, expect } from 'vitest';
import { MAX_ROM_BYTES, romTitleFromFilename, validateRomUpload } from './rom-upload';

describe('retro/rom-upload', () => {
  describe('romTitleFromFilename — 파일명에서 보여줄 제목 뽑기', () => {
    it.each([
      ['Super Mario Bros.sfc', 'Super Mario Bros'],
      ['zelda_a_link_to_the_past.sfc', 'zelda a link to the past'],
      ['Sonic - The Hedgehog (World).smc', 'Sonic - The Hedgehog (World)'],
      ['../../etc/passwd.sfc', 'passwd'],
    ])('%s → %s', (filename, expected) => {
      expect(romTitleFromFilename(filename)).toBe(expected);
    });

    it('이름이 비면 기본값을 준다', () => {
      expect(romTitleFromFilename('.sfc')).toBe('이름 없는 롬');
      expect(romTitleFromFilename('')).toBe('이름 없는 롬');
    });

    it('지나치게 긴 이름은 잘린다', () => {
      expect(romTitleFromFilename('a'.repeat(300) + '.sfc').length).toBeLessThanOrEqual(120);
    });
  });

  describe('validateRomUpload', () => {
    it('확장자로 플랫폼을 추론한다', () => {
      const r = validateRomUpload({ filename: 'tetris.sfc', size: 32 * 1024 });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.platform).toBe('snes');
        expect(r.core).toBe('snes9x');
        expect(r.title).toBe('tetris');
      }
    });

    it('플랫폼을 직접 지정하면 확장자 추론보다 우선한다', () => {
      // .bin 처럼 추론 못 하는 파일을 위해 필요하다.
      const r = validateRomUpload({ filename: 'game.bin', size: 1024, platform: 'cps2' });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.platform).toBe('cps2');
    });

    it('추론도 못 하고 지정도 없으면 거부한다', () => {
      const r = validateRomUpload({ filename: 'game.bin', size: 1024 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain('기종');
    });

    it('지원하지 않는 플랫폼 지정은 거부한다', () => {
      const r = validateRomUpload({ filename: 'game.bin', size: 1024, platform: 'psx' });
      expect(r.ok).toBe(false);
    });

    it('빈 파일은 거부한다', () => {
      const r = validateRomUpload({ filename: 'a.sfc', size: 0 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain('비어');
    });

    it('한도를 넘으면 거부한다', () => {
      expect(validateRomUpload({ filename: 'a.sfc', size: MAX_ROM_BYTES }).ok).toBe(true);
      expect(validateRomUpload({ filename: 'a.sfc', size: MAX_ROM_BYTES + 1 }).ok).toBe(false);
    });

    // #146 — nginx 의 location 값과 어긋나면 사용자에게 이유가 안 보이는 413 이 난다.
    it('상한은 50MB 다 — nginx location 과 같은 값이어야 한다', () => {
      expect(MAX_ROM_BYTES).toBe(50 * 1024 * 1024);
    });

    it('한도 초과 사유에 MB 숫자가 들어간다 — 사용자가 얼마나 줄여야 하는지 알아야 한다', () => {
      const r = validateRomUpload({ filename: 'a.sfc', size: MAX_ROM_BYTES + 1 });
      if (!r.ok) expect(r.reason).toMatch(/\d+\s*MB/);
    });


  });
});

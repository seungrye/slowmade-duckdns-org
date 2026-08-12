import { describe, it, expect } from 'vitest';
import {
  MAX_ROM_BYTES,
  OWNER_MAX_ROM_BYTES,
  romTitleFromFilename,
  validateRomUpload,
} from './rom-upload';

describe('retro/rom-upload', () => {
  describe('romTitleFromFilename — 파일명에서 보여줄 제목 뽑기', () => {
    it.each([
      ['Super Mario Bros.nes', 'Super Mario Bros'],
      ['zelda_a_link_to_the_past.sfc', 'zelda a link to the past'],
      ['Sonic - The Hedgehog (World).md', 'Sonic - The Hedgehog (World)'],
      ['../../etc/passwd.gba', 'passwd'],
    ])('%s → %s', (filename, expected) => {
      expect(romTitleFromFilename(filename)).toBe(expected);
    });

    it('이름이 비면 기본값을 준다', () => {
      expect(romTitleFromFilename('.nes')).toBe('이름 없는 롬');
      expect(romTitleFromFilename('')).toBe('이름 없는 롬');
    });

    it('지나치게 긴 이름은 잘린다', () => {
      expect(romTitleFromFilename('a'.repeat(300) + '.nes').length).toBeLessThanOrEqual(120);
    });
  });

  describe('validateRomUpload', () => {
    it('확장자로 플랫폼을 추론한다', () => {
      const r = validateRomUpload({ filename: 'tetris.gb', size: 32 * 1024 });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.platform).toBe('gb');
        expect(r.core).toBe('gambatte');
        expect(r.title).toBe('tetris');
      }
    });

    it('플랫폼을 직접 지정하면 확장자 추론보다 우선한다', () => {
      // .bin 처럼 추론 못 하는 파일을 위해 필요하다.
      const r = validateRomUpload({ filename: 'game.bin', size: 1024, platform: 'md' });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.platform).toBe('md');
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
      const r = validateRomUpload({ filename: 'a.nes', size: 0 });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain('비어');
    });

    it('한도를 넘으면 거부하고, owner 는 한도가 더 높다', () => {
      const big = { filename: 'a.gba', size: MAX_ROM_BYTES + 1 };
      expect(validateRomUpload(big).ok).toBe(false);
      expect(validateRomUpload({ ...big, isOwner: true }).ok).toBe(true);

      const huge = { filename: 'a.gba', size: OWNER_MAX_ROM_BYTES + 1, isOwner: true };
      expect(validateRomUpload(huge).ok).toBe(false);
    });

    it('한도 초과 사유에 MB 숫자가 들어간다 — 사용자가 얼마나 줄여야 하는지 알아야 한다', () => {
      const r = validateRomUpload({ filename: 'a.gba', size: MAX_ROM_BYTES + 1 });
      if (!r.ok) expect(r.reason).toMatch(/\d+\s*MB/);
    });

    it('일반 한도는 nginx 서버 기본값(16M) 안에 있다', () => {
      // 넘기면 nginx 가 앱에 닿기 전에 413 을 내 사용자에게 이유가 안 보인다.
      expect(MAX_ROM_BYTES).toBeLessThan(16 * 1024 * 1024);
    });
  });
});

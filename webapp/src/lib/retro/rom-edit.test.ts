import { describe, it, expect } from 'vitest';
import {
  MAX_COVER_BYTES,
  MAX_TITLE_LENGTH,
  detectImageFormat,
  normalizeRomTitle,
  validateCoverUpload,
} from './rom-edit';

const bytes = (...n: number[]) => new Uint8Array(n);
const PNG = () => bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4);
const JPEG = () => bytes(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8);
const GIF = () => new Uint8Array([...Buffer.from('GIF89a'), 1, 2, 3, 4, 5, 6]);
const WEBP = () => new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]);

describe('retro/rom-edit', () => {
  describe('normalizeRomTitle', () => {
    it('앞뒤 공백을 지운다', () => {
      expect(normalizeRomTitle('  젤다의 전설  ')).toBe('젤다의 전설');
    });

    it('가운데 공백은 건드리지 않는다 — 제목의 일부다', () => {
      expect(normalizeRomTitle('Super  Mario Bros')).toBe('Super  Mario Bros');
    });

    it('비었거나 공백뿐이면 null — 이름 없는 카드를 만들지 않는다', () => {
      expect(normalizeRomTitle('')).toBeNull();
      expect(normalizeRomTitle('   ')).toBeNull();
      expect(normalizeRomTitle(undefined)).toBeNull();
      expect(normalizeRomTitle(null)).toBeNull();
    });

    it('너무 길면 자른다', () => {
      const long = 'a'.repeat(MAX_TITLE_LENGTH + 50);
      expect(normalizeRomTitle(long)).toHaveLength(MAX_TITLE_LENGTH);
    });

    it('개행은 공백으로 바꾼다 — 한 줄짜리 이름이다', () => {
      expect(normalizeRomTitle('젤다\n전설')).toBe('젤다 전설');
    });
  });

  describe('detectImageFormat — 확장자가 아니라 내용으로 본다', () => {
    it.each([
      ['PNG', PNG(), 'image/png'],
      ['JPEG', JPEG(), 'image/jpeg'],
      ['GIF', GIF(), 'image/gif'],
      ['WebP', WEBP(), 'image/webp'],
    ])('%s 를 알아본다', (_label, data, expected) => {
      expect(detectImageFormat(data)).toBe(expected);
    });

    it('그림이 아니면 null', () => {
      expect(detectImageFormat(new Uint8Array([...Buffer.from('PATCH')]))).toBeNull();
      expect(detectImageFormat(bytes(1, 2, 3))).toBeNull();
      expect(detectImageFormat(new Uint8Array(0))).toBeNull();
    });

    it('RIFF 이지만 WEBP 가 아니면 거부한다 — wav 도 RIFF 로 시작한다', () => {
      const wav = new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVE')]);
      expect(detectImageFormat(wav)).toBeNull();
    });
  });

  describe('validateCoverUpload', () => {
    it('그림이면 형식을 돌려준다', () => {
      const r = validateCoverUpload({ size: 1024, bytes: PNG() });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.format).toBe('image/png');
    });

    it('이름만 .png 인 파일은 거부한다', () => {
      const r = validateCoverUpload({ size: 1024, bytes: new Uint8Array([...Buffer.from('PK')]) });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/이미지/);
    });

    it('빈 파일은 거부한다', () => {
      expect(validateCoverUpload({ size: 0, bytes: PNG() }).ok).toBe(false);
    });

    it('한도를 넘으면 거부하고 MB 를 알려 준다', () => {
      const r = validateCoverUpload({ size: MAX_COVER_BYTES + 1, bytes: PNG() });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/\d+\s*MB/);
    });

    it('한도는 middleware 본문 제한(10MB) 안에 있다', () => {
      expect(MAX_COVER_BYTES).toBeLessThan(10 * 1024 * 1024);
    });
  });
});

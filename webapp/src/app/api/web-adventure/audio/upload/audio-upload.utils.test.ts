import { describe, expect, it } from 'vitest';
import {
  ALLOWED_AUDIO_MIME,
  MAX_AUDIO_BYTES,
  buildAudioKey,
  validateAudioFormData,
} from './audio-upload.utils';

describe('buildAudioKey', () => {
  it('타임스탬프 + 안전한 파일명으로 web-adventure/audio 키를 만든다', () => {
    expect(buildAudioKey(1700000000000, 'harbor.mp3')).toBe('web-adventure/audio/1700000000000-harbor.mp3');
  });

  it('경로 구분자(/ \\)를 밑줄로 치환한다(키 주입 방지)', () => {
    expect(buildAudioKey(1, 'a/b\\c.mp3')).toBe('web-adventure/audio/1-a_b_c.mp3');
  });

  it('빈 이름이면 audio 로 폴백', () => {
    expect(buildAudioKey(1, '')).toBe('web-adventure/audio/1-audio');
  });
});

describe('validateAudioFormData', () => {
  it.each(ALLOWED_AUDIO_MIME)('%s 타입은 허용한다', (mime) => {
    const fd = new FormData();
    fd.append('file', new File(['x'], 'a', { type: mime }));
    const r = validateAudioFormData(fd);
    expect(r.ok).toBe(true);
  });

  it('file 이 없으면 ok:false', () => {
    const r = validateAudioFormData(new FormData());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('No file uploaded');
  });

  it('오디오가 아닌 MIME 이면 ok:false', () => {
    const fd = new FormData();
    fd.append('file', new File(['<svg>'], 'hack.svg', { type: 'image/svg+xml' }));
    const r = validateAudioFormData(fd);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/허용되지 않는/);
  });

  it('크기 상한 초과 시 ok:false', () => {
    const fd = new FormData();
    fd.append('file', new File([new Uint8Array(MAX_AUDIO_BYTES + 1)], 'big.mp3', { type: 'audio/mpeg' }));
    const r = validateAudioFormData(fd);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/File too large/);
  });
});

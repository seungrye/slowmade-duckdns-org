import { describe, expect, it } from 'vitest';
import { buildFileName, buildPublicUrl, validateUploadFormData, MAX_FILE_BYTES, MAX_THUMB_BYTES } from './upload.utils';

describe('buildFileName', () => {
  // 타임스탬프와 원본 파일명을 하이픈으로 연결한다
  it('타임스탬프와 원본 파일명을 조합한다', () => {
    expect(buildFileName(1700000000000, 'photo.jpg')).toBe('1700000000000-photo.jpg');
  });
});

describe('buildPublicUrl', () => {
  // endpoint, bucket, fileName으로 HTTPS URL을 조립한다
  it('endpoint, bucket, fileName으로 공개 URL을 생성한다', () => {
    expect(buildPublicUrl('storage.example.com', 'my-bucket', '123-photo.jpg'))
      .toBe('https://storage.example.com/my-bucket/123-photo.jpg');
  });

  it('thumbnails/ 경로도 올바르게 생성한다', () => {
    expect(buildPublicUrl('storage.example.com', 'my-bucket', 'thumbnails/123-photo.jpg'))
      .toBe('https://storage.example.com/my-bucket/thumbnails/123-photo.jpg');
  });

  it('파일명의 공백을 URL 인코딩한다', () => {
    expect(buildPublicUrl('storage.example.com', 'my-bucket', '123-my photo.jpg'))
      .toBe('https://storage.example.com/my-bucket/123-my%20photo.jpg');
  });

  it('thumbnails/ 경로 구분자는 인코딩하지 않는다', () => {
    expect(buildPublicUrl('storage.example.com', 'my-bucket', 'thumbnails/123-my photo.jpg'))
      .toBe('https://storage.example.com/my-bucket/thumbnails/123-my%20photo.jpg');
  });

  // apex 경로(A안): host 에 경로(/s3)가 포함돼도 올바른 apex URL 을 만든다.
  // MINIO_PUBLIC_HOST=slowmade.duckdns.org/s3 → https://slowmade.duckdns.org/s3/<bucket>/<key>
  it('host 에 경로(/s3)가 포함되면 apex 경로 URL 을 만든다', () => {
    expect(buildPublicUrl('slowmade.duckdns.org/s3', 'handmade-site', '123-photo.jpg'))
      .toBe('https://slowmade.duckdns.org/s3/handmade-site/123-photo.jpg');
  });
});

describe('validateUploadFormData', () => {
  // file과 thumbnail 존재 여부 및 MIME 타입을 검증한다
  it('file과 thumbnail이 모두 있으면 ok: true를 반환한다', () => {
    const formData = new FormData();
    formData.append('file', new File(['content'], 'photo.jpg', { type: 'image/jpeg' }));
    formData.append('thumbnail', new File(['thumb'], 'thumb.jpg', { type: 'image/jpeg' }));

    const result = validateUploadFormData(formData);
    expect(result.ok).toBe(true);
  });

  it('file이 없으면 ok: false와 에러 메시지를 반환한다', () => {
    const formData = new FormData();

    const result = validateUploadFormData(formData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('No file uploaded');
  });

  it('thumbnail이 없으면 ok: false와 에러 메시지를 반환한다', () => {
    const formData = new FormData();
    formData.append('file', new File(['content'], 'photo.jpg', { type: 'image/jpeg' }));

    const result = validateUploadFormData(formData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('No thumbnail uploaded');
  });

  it('허용되지 않은 file MIME 타입이면 ok: false를 반환한다', () => {
    const formData = new FormData();
    formData.append('file', new File(['<html>'], 'hack.html', { type: 'text/html' }));
    formData.append('thumbnail', new File(['thumb'], 'thumb.jpg', { type: 'image/jpeg' }));

    const result = validateUploadFormData(formData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Invalid file type');
  });

  it('허용되지 않은 thumbnail MIME 타입이면 ok: false를 반환한다', () => {
    const formData = new FormData();
    formData.append('file', new File(['content'], 'photo.jpg', { type: 'image/jpeg' }));
    formData.append('thumbnail', new File(['<svg>'], 'hack.svg', { type: 'image/svg+xml' }));

    const result = validateUploadFormData(formData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Invalid thumbnail type');
  });

  it.each(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])('%s 타입은 허용한다', (mime) => {
    const formData = new FormData();
    formData.append('file', new File(['content'], 'photo', { type: mime }));
    formData.append('thumbnail', new File(['thumb'], 'thumb', { type: mime }));

    const result = validateUploadFormData(formData);
    expect(result.ok).toBe(true);
  });

  it('file 크기가 상한을 초과하면 ok: false (스토리지/대역폭 DoS 방지)', () => {
    const formData = new FormData();
    formData.append('file', new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'big.jpg', { type: 'image/jpeg' }));
    formData.append('thumbnail', new File(['thumb'], 'thumb.jpg', { type: 'image/jpeg' }));

    const result = validateUploadFormData(formData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/File too large/);
  });

  it('thumbnail 크기가 상한을 초과하면 ok: false', () => {
    const formData = new FormData();
    formData.append('file', new File(['ok'], 'ok.jpg', { type: 'image/jpeg' }));
    formData.append('thumbnail', new File([new Uint8Array(MAX_THUMB_BYTES + 1)], 'thumb.jpg', { type: 'image/jpeg' }));

    const result = validateUploadFormData(formData);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Thumbnail too large/);
  });
});

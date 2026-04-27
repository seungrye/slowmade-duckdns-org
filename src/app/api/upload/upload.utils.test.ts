import { describe, expect, it } from 'vitest';
import { buildFileName, buildPublicUrl, validateUploadFormData } from './upload.utils';

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
});

describe('validateUploadFormData', () => {
  // file과 thumbnail 존재 여부를 검증한다
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
});

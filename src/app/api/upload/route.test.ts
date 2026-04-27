import { vi, describe, it, expect, beforeEach } from 'vitest';

// import 전에 실행되어야 하므로 vi.hoisted 사용
const mockPutObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRemoveObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.hoisted(() => {
  process.env.MINIO_ENDPOINT = 'test-endpoint.com';
  process.env.MINIO_ACCESSKEY = 'test-key';
  process.env.MINIO_SECRETKEY = 'test-secret';
  process.env.MINIO_BUCKET = 'test-bucket';
});

vi.mock('minio', () => ({
  Client: class {
    putObject = mockPutObject;
    removeObject = mockRemoveObject;
  },
}));

import { POST } from './route';
import { NextRequest } from 'next/server';

function makeRequest(formData: FormData): NextRequest {
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    body: formData,
  }) as NextRequest;
}

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPutObject.mockResolvedValue(undefined);
    mockRemoveObject.mockResolvedValue(undefined);
  });

  it('file이 없으면 400을 반환한다', async () => {
    const res = await POST(makeRequest(new FormData()));
    expect(res.status).toBe(400);
  });

  it('thumbnail이 없으면 400을 반환한다', async () => {
    const formData = new FormData();
    formData.append('file', new File(['content'], 'photo.jpg', { type: 'image/jpeg' }));

    const res = await POST(makeRequest(formData));
    expect(res.status).toBe(400);
  });

  it('업로드 성공 시 url과 thumbnailUrl을 반환한다', async () => {
    const formData = new FormData();
    formData.append('file', new File(['content'], 'photo.jpg', { type: 'image/jpeg' }));
    formData.append('thumbnail', new File(['thumb'], 'thumb.jpg', { type: 'image/jpeg' }));

    const res = await POST(makeRequest(formData));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.url).toContain('test-endpoint.com/test-bucket');
    expect(data.thumbnailUrl).toContain('test-endpoint.com/test-bucket/thumbnails/');
  });

  it('원본 업로드 실패 시 500을 반환한다', async () => {
    mockPutObject.mockRejectedValue(new Error('MinIO connection failed'));

    const formData = new FormData();
    formData.append('file', new File(['content'], 'photo.jpg', { type: 'image/jpeg' }));
    formData.append('thumbnail', new File(['thumb'], 'thumb.jpg', { type: 'image/jpeg' }));

    const res = await POST(makeRequest(formData));
    expect(res.status).toBe(500);
  });

  it('rollback(removeObject) 실패 시에도 500을 반환한다', async () => {
    mockPutObject
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('thumbnail fail'));
    mockRemoveObject.mockRejectedValue(new Error('remove fail'));

    const formData = new FormData();
    formData.append('file', new File(['content'], 'photo.jpg', { type: 'image/jpeg' }));
    formData.append('thumbnail', new File(['thumb'], 'thumb.jpg', { type: 'image/jpeg' }));

    const res = await POST(makeRequest(formData));
    expect(res.status).toBe(500);
  });

  it('썸네일 업로드 실패 시 원본 파일을 삭제하고 500을 반환한다', async () => {
    mockPutObject
      .mockResolvedValueOnce(undefined)           // 원본 업로드 성공
      .mockRejectedValueOnce(new Error('fail'));   // 썸네일 업로드 실패

    const formData = new FormData();
    formData.append('file', new File(['content'], 'photo.jpg', { type: 'image/jpeg' }));
    formData.append('thumbnail', new File(['thumb'], 'thumb.jpg', { type: 'image/jpeg' }));

    const res = await POST(makeRequest(formData));
    expect(res.status).toBe(500);
    expect(mockRemoveObject).toHaveBeenCalledOnce();
    expect(mockRemoveObject).toHaveBeenCalledWith('test-bucket', expect.stringMatching(/photo\.jpg$/));
  });
});

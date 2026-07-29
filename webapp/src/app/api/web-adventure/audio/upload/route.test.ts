import { vi, describe, it, expect, beforeEach } from 'vitest';

// import 전에 실행되어야 하므로 vi.hoisted 사용
const mockPutObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.hoisted(() => {
  process.env.MINIO_ENDPOINT = 'test-endpoint.com';
  process.env.MINIO_ACCESSKEY = 'test-key';
  process.env.MINIO_SECRETKEY = 'test-secret';
  process.env.MINIO_BUCKET = 'test-bucket';
});

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('minio', () => ({
  Client: class {
    putObject = mockPutObject;
  },
}));

import { POST } from './route';
import { NextRequest } from 'next/server';
import { auth } from '@/auth';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

function makeRequest(formData: FormData): NextRequest {
  return new Request('http://localhost/api/web-adventure/audio/upload', {
    method: 'POST',
    body: formData,
  }) as NextRequest;
}

describe('POST /api/web-adventure/audio/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com' } });
    mockPutObject.mockResolvedValue(undefined);
  });

  it('인증되지 않으면 401', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest(new FormData()));
    expect(res.status).toBe(401);
  });

  it('file 이 없으면 400', async () => {
    const res = await POST(makeRequest(new FormData()));
    expect(res.status).toBe(400);
  });

  it('오디오가 아닌 형식이면 400', async () => {
    const fd = new FormData();
    fd.append('file', new File(['<svg>'], 'x.svg', { type: 'image/svg+xml' }));
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
  });

  it('업로드 성공 시 public URL 을 반환한다', async () => {
    const fd = new FormData();
    fd.append('file', new File(['audio-bytes'], 'harbor.mp3', { type: 'audio/mpeg' }));
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.url).toContain('test-endpoint.com/test-bucket/web-adventure/audio/');
    expect(data.url).toMatch(/harbor\.mp3$/);
    expect(mockPutObject).toHaveBeenCalledOnce();
  });

  it('MinIO 실패 시 500', async () => {
    mockPutObject.mockRejectedValue(new Error('MinIO connection failed'));
    const fd = new FormData();
    fd.append('file', new File(['audio-bytes'], 'harbor.mp3', { type: 'audio/mpeg' }));
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(500);
  });
});

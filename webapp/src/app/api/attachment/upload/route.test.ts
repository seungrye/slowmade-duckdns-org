import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// It has to run before the imports, so vi.hoisted is used
const mockPutObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.hoisted(() => {
  process.env.MINIO_ENDPOINT = 'test-endpoint.com';
  process.env.MINIO_ACCESSKEY = 'test-key';
  process.env.MINIO_SECRETKEY = 'test-secret';
  process.env.MINIO_BUCKET = 'test-bucket';
  process.env.OWNER_EMAIL = 'owner@test.com'; // The comparison basis for isOwner (using the real env.ts and isOwner)
});

// Both requireAuth and isOwner call auth() internally -> mocking auth alone verifies the branching through the real implementation.
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('minio', () => ({
  Client: class {
    putObject = mockPutObject;
  },
}));

import { POST } from './route';
import { auth } from '@/auth';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const MB = 1024 * 1024;

// A fake req is used to set file.size without a multipart round trip (a round trip re-parses the File and its size becomes the real bytes).
function makeReq(file: unknown): NextRequest {
  return {
    formData: async () => ({ get: (k: string) => (k === 'file' ? file : null) }),
  } as unknown as NextRequest;
}

// A real File (so instanceof passes) with only size overridden. arrayBuffer is 3 bytes (irrelevant, since putObject is mocked).
function fileOf(size: number, type = 'application/pdf', name = 'f.pdf'): File {
  const f = new File([new Uint8Array([1, 2, 3])], name, { type });
  Object.defineProperty(f, 'size', { value: size, configurable: true });
  return f;
}

describe('POST /api/attachment/upload — owner 100MB / 일반 15MB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { email: 'user@test.com' } }); // the default: logged in as a non-owner
    mockPutObject.mockResolvedValue(undefined);
  });

  it('미인증이면 401', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeReq(fileOf(1 * MB)));
    expect(res.status).toBe(401);
  });

  it('file 이 없으면 400', async () => {
    const res = await POST(makeReq(null));
    expect(res.status).toBe(400);
  });

  it('허용되지 않는 MIME 는 400', async () => {
    const res = await POST(makeReq(fileOf(1 * MB, 'image/svg+xml', 'x.svg')));
    expect(res.status).toBe(400);
  });

  it('비-owner: 15MB 이내는 200 + 업로드', async () => {
    const res = await POST(makeReq(fileOf(10 * MB)));
    expect(res.status).toBe(200);
    expect(mockPutObject).toHaveBeenCalledOnce();
  });

  it('비-owner: 15MB 초과(16MB)는 413', async () => {
    const res = await POST(makeReq(fileOf(16 * MB)));
    expect(res.status).toBe(413);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it('owner: 15MB 초과·100MB 이내(50MB)는 200 + 업로드', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'owner@test.com' } });
    const res = await POST(makeReq(fileOf(50 * MB)));
    expect(res.status).toBe(200);
    expect(mockPutObject).toHaveBeenCalledOnce();
  });

  it('owner: 100MB 초과(101MB)는 413', async () => {
    mockAuth.mockResolvedValue({ user: { email: 'owner@test.com' } });
    const res = await POST(makeReq(fileOf(101 * MB)));
    expect(res.status).toBe(413);
    expect(mockPutObject).not.toHaveBeenCalled();
  });
});

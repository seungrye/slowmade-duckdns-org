import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Readable } from 'node:stream';

const mockPutObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRemoveObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockGetObject = vi.hoisted(() => vi.fn());
const mockFindOne = vi.hoisted(() => vi.fn());
const mockUpdateOne = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.MINIO_ENDPOINT = 'test-endpoint.com';
  process.env.MINIO_ACCESSKEY = 'test-key';
  process.env.MINIO_SECRETKEY = 'test-secret';
  process.env.MINIO_BUCKET = 'test-bucket';
});

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock('minio', () => ({
  Client: class {
    putObject = mockPutObject;
    removeObject = mockRemoveObject;
    getObject = mockGetObject;
  },
}));
vi.mock('@/models/retro-rom', () => ({ default: { findOne: mockFindOne, updateOne: mockUpdateOne } }));

import { GET, POST } from './route';
import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { MAX_COVER_BYTES } from '@/lib/retro/rom-edit';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const ROM_ID = '653f1a2b3c4d5e6f70819202';

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function imageFile(head = PNG_HEAD, size = 1024, name = 'cover.png'): File {
  const bytes = new Uint8Array(size);
  head.forEach((b, i) => (bytes[i] = b));
  return new File([bytes], name);
}

function post(file: File | null): NextRequest {
  const f = new FormData();
  if (file) f.set('file', file);
  return new Request('http://localhost/x', { method: 'POST', body: f }) as NextRequest;
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function findOneReturns(doc: unknown) {
  mockFindOne.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(doc) }) });
}

describe('/api/games/retro/roms/[id]/cover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { email: 'me@test.com' } });
    findOneReturns({});
    mockPutObject.mockResolvedValue(undefined);
    mockUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mockGetObject.mockResolvedValue(Readable.from([Buffer.from([1, 2, 3])]));
  });

  describe('POST — 올리기', () => {
    it('로그인하지 않으면 401', async () => {
      mockAuth.mockResolvedValue(null);
      expect((await POST(post(imageFile()), ctx(ROM_ID))).status).toBe(401);
      expect(mockPutObject).not.toHaveBeenCalled();
    });

    it('내 롬에 커버를 건다', async () => {
      const res = await POST(post(imageFile()), ctx(ROM_ID));
      expect(res.status).toBe(200);

      const [bucket, key, , , meta] = mockPutObject.mock.calls[0];
      expect(bucket).toBe('test-bucket');
      expect(key).toMatch(/^retro-covers\//);
      // 브라우저가 그대로 그릴 수 있도록 형식을 함께 저장한다.
      expect(meta['Content-Type']).toBe('image/png');

      const [, update] = mockUpdateOne.mock.calls[0];
      expect(update.$set.coverFormat).toBe('image/png');
    });

    it('남의 롬(또는 없는 롬)이면 404 이고 저장하지 않는다', async () => {
      findOneReturns(null);
      expect((await POST(post(imageFile()), ctx(ROM_ID))).status).toBe(404);
      expect(mockPutObject).not.toHaveBeenCalled();
    });

    it('이름만 이미지인 파일은 거부한다 — 매직으로 본다', async () => {
      const fake = imageFile([0x50, 0x4b, 0x03, 0x04], 1024, 'cover.png'); // zip
      expect((await POST(post(fake), ctx(ROM_ID))).status).toBe(400);
      expect(mockPutObject).not.toHaveBeenCalled();
    });

    it('한도를 넘으면 413', async () => {
      expect((await POST(post(imageFile(PNG_HEAD, MAX_COVER_BYTES + 1)), ctx(ROM_ID))).status).toBe(413);
      expect(mockPutObject).not.toHaveBeenCalled();
    });

    it('파일이 없으면 400', async () => {
      expect((await POST(post(null), ctx(ROM_ID))).status).toBe(400);
    });

    it('이전 커버는 지운다 — 되살릴 이유가 없다', async () => {
      findOneReturns({ coverKey: 'retro-covers/old' });
      await POST(post(imageFile()), ctx(ROM_ID));
      expect(mockRemoveObject).toHaveBeenCalledWith('test-bucket', 'retro-covers/old');
    });

    it('기록이 실패하면 방금 올린 것을 지운다', async () => {
      mockUpdateOne.mockRejectedValue(new Error('db down'));
      expect((await POST(post(imageFile()), ctx(ROM_ID))).status).toBe(500);
      expect(mockRemoveObject).toHaveBeenCalledWith('test-bucket', mockPutObject.mock.calls[0][1]);
    });

    it('응답에 오브젝트 키가 없다', async () => {
      const body = await (await POST(post(imageFile()), ctx(ROM_ID))).json();
      expect(JSON.stringify(body)).not.toContain('retro-covers/');
    });
  });

  describe('GET — 내려주기', () => {
    it('로그인하지 않으면 404', async () => {
      mockAuth.mockResolvedValue(null);
      expect((await GET(post(null), ctx(ROM_ID))).status).toBe(404);
    });

    it('커버가 없으면 404', async () => {
      findOneReturns({});
      expect((await GET(post(null), ctx(ROM_ID))).status).toBe(404);
      expect(mockGetObject).not.toHaveBeenCalled();
    });

    it('저장된 형식으로 내려준다', async () => {
      findOneReturns({ coverKey: 'retro-covers/a', coverFormat: 'image/webp' });
      const res = await GET(post(null), ctx(ROM_ID));
      expect(res.headers.get('Content-Type')).toBe('image/webp');
      expect(res.headers.get('Cache-Control')).toContain('private');
    });

    it('이상한 형식이 저장돼 있으면 png 로 낮춘다 — 헤더로 새 나가지 않게', async () => {
      findOneReturns({ coverKey: 'retro-covers/a', coverFormat: 'text/html' });
      expect((await GET(post(null), ctx(ROM_ID))).headers.get('Content-Type')).toBe('image/png');
    });

    it('내 롬만 찾는다', async () => {
      findOneReturns({ coverKey: 'retro-covers/a' });
      await GET(post(null), ctx(ROM_ID));
      expect(mockFindOne).toHaveBeenCalledWith({
        _id: ROM_ID,
        userEmail: 'me@test.com',
        isDeleted: { $ne: true },
      });
    });
  });
});

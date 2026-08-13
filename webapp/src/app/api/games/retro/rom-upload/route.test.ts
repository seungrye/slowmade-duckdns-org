import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockPutObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRemoveObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockCreate = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.MINIO_ENDPOINT = 'test-endpoint.com';
  process.env.MINIO_ACCESSKEY = 'test-key';
  process.env.MINIO_SECRETKEY = 'test-secret';
  process.env.MINIO_BUCKET = 'test-bucket';
});

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/require-owner', () => ({ isOwner: vi.fn().mockResolvedValue(false) }));
vi.mock('minio', () => ({
  Client: class {
    putObject = mockPutObject;
    removeObject = mockRemoveObject;
  },
}));
vi.mock('@/models/retro-rom', () => ({ default: { create: mockCreate } }));

import { POST } from './route';
import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { isOwner } from '@/lib/require-owner';
import { MAX_ROM_BYTES } from '@/lib/retro/rom-upload';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockIsOwner = isOwner as unknown as ReturnType<typeof vi.fn>;

function romFile(name: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type: 'application/octet-stream' });
}

function request(form: FormData): NextRequest {
  return new Request('http://localhost/api/games/retro/rom-upload', {
    method: 'POST',
    body: form,
  }) as NextRequest;
}

describe('POST /api/games/retro/rom-upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { email: 'me@test.com' } });
    mockIsOwner.mockResolvedValue(false);
    mockPutObject.mockResolvedValue(undefined);
    mockCreate.mockImplementation((doc) => Promise.resolve({ ...doc, _id: 'newid', createdAt: new Date(0) }));
  });

  it('로그인하지 않으면 401 이고 아무것도 저장하지 않는다', async () => {
    mockAuth.mockResolvedValue(null);
    const form = new FormData();
    form.set('file', romFile('a.sfc'));
    expect((await POST(request(form))).status).toBe(401);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it('파일이 없으면 400', async () => {
    expect((await POST(request(new FormData()))).status).toBe(400);
  });

  it('올리면 MinIO 에 넣고 내 소유로 기록한다', async () => {
    const form = new FormData();
    form.set('file', romFile('Super Mario.sfc', 2048));
    const res = await POST(request(form));
    expect(res.status).toBe(201);

    const [bucket, key] = mockPutObject.mock.calls[0];
    expect(bucket).toBe('test-bucket');
    // 키를 추측해 남의 롬을 받아 가지 못하도록 랜덤 프리픽스를 붙인다.
    expect(key).toMatch(/^retro-roms\/[0-9a-f-]{36}-/);

    const doc = mockCreate.mock.calls[0][0];
    expect(doc.userEmail).toBe('me@test.com');
    expect(doc.platform).toBe('snes');
    expect(doc.core).toBe('snes9x');
    expect(doc.title).toBe('Super Mario');
    expect(doc.size).toBe(2048);
  });

  it('응답에 오브젝트 키가 들어가지 않는다', async () => {
    const form = new FormData();
    form.set('file', romFile('a.sfc'));
    const body = await (await POST(request(form))).json();
    expect(JSON.stringify(body)).not.toContain('retro-roms/');
  });

  it('기종을 모르는 확장자는 400 이고 저장하지 않는다', async () => {
    const form = new FormData();
    form.set('file', romFile('mystery.bin'));
    expect((await POST(request(form))).status).toBe(400);
    expect(mockPutObject).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('기종을 직접 지정하면 확장자를 몰라도 받는다', async () => {
    const form = new FormData();
    form.set('file', romFile('mystery.bin'));
    form.set('platform', 'cps2');
    expect((await POST(request(form))).status).toBe(201);
    expect(mockCreate.mock.calls[0][0].platform).toBe('cps2');
  });

  it('한도를 넘으면 413 이고 저장하지 않는다', async () => {
    const form = new FormData();
    form.set('file', romFile('big.sfc', MAX_ROM_BYTES + 1));
    expect((await POST(request(form))).status).toBe(413);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it('owner 는 일반 한도를 넘겨도 받는다', async () => {
    mockIsOwner.mockResolvedValue(true);
    const form = new FormData();
    form.set('file', romFile('big.sfc', MAX_ROM_BYTES + 1));
    expect((await POST(request(form))).status).toBe(201);
  });

  it('DB 기록이 실패하면 올린 오브젝트를 지운다 — 고아 파일을 남기지 않는다', async () => {
    mockCreate.mockRejectedValue(new Error('db down'));
    const form = new FormData();
    form.set('file', romFile('a.sfc'));
    expect((await POST(request(form))).status).toBe(500);
    expect(mockRemoveObject).toHaveBeenCalledTimes(1);
    expect(mockRemoveObject.mock.calls[0][1]).toBe(mockPutObject.mock.calls[0][1]);
  });
});

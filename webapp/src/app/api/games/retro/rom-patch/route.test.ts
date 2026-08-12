import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockPutObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRemoveObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockExists = vi.hoisted(() => vi.fn());
const mockFindOneAndUpdate = vi.hoisted(() => vi.fn());

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
  },
}));
vi.mock('@/models/retro-rom', () => ({
  default: { exists: mockExists, findOneAndUpdate: mockFindOneAndUpdate },
}));

import { POST } from './route';
import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { MAX_PATCH_BYTES } from '@/lib/retro/patch-upload';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const ROM_ID = '653f1a2b3c4d5e6f70819202';
const PATCH_ID = '653f1a2b3c4d5e6f70819999';

function patchFile(name: string, magic = 'PATCH', size = 64): File {
  const bytes = new Uint8Array(size);
  for (let i = 0; i < magic.length; i++) bytes[i] = magic.charCodeAt(i);
  return new File([bytes], name, { type: 'application/octet-stream' });
}

function request(form: FormData): NextRequest {
  return new Request('http://localhost/api/games/retro/rom-patch', {
    method: 'POST',
    body: form,
  }) as NextRequest;
}

function form(file: File | null, romId: string | null): FormData {
  const f = new FormData();
  if (file) f.set('file', file);
  if (romId) f.set('romId', romId);
  return f;
}

/** findOneAndUpdate(...).lean() 체인 흉내. */
function updateReturns(doc: unknown) {
  mockFindOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve(doc) });
}

describe('POST /api/games/retro/rom-patch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { email: 'me@test.com' } });
    mockExists.mockResolvedValue({ _id: ROM_ID });
    mockPutObject.mockResolvedValue(undefined);
    updateReturns({
      patches: [
        { _id: PATCH_ID, name: 'ko.ips', format: 'ips', size: 64, objectKey: 'retro-patches/secret.ips', createdAt: new Date(0) },
      ],
    });
  });

  it('로그인하지 않으면 401 이고 아무것도 저장하지 않는다', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await POST(request(form(patchFile('ko.ips'), ROM_ID)))).status).toBe(401);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it('파일이 없으면 400', async () => {
    expect((await POST(request(form(null, ROM_ID)))).status).toBe(400);
  });

  it('romId 가 이상하면 404', async () => {
    expect((await POST(request(form(patchFile('ko.ips'), 'not-an-id')))).status).toBe(404);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it('남의 롬(또는 없는 롬)에는 붙일 수 없다 — 파일도 올리지 않는다', async () => {
    mockExists.mockResolvedValue(null);
    expect((await POST(request(form(patchFile('ko.ips'), ROM_ID)))).status).toBe(404);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it('내 롬인지 확인한 뒤에 붙인다', async () => {
    const res = await POST(request(form(patchFile('한글패치_v1.ips'), ROM_ID)));
    expect(res.status).toBe(201);
    expect(mockExists).toHaveBeenCalledWith({
      _id: ROM_ID,
      userEmail: 'me@test.com',
      isDeleted: { $ne: true },
    });
    const [, update] = mockFindOneAndUpdate.mock.calls[0];
    expect(update.$push.patches).toMatchObject({ name: '한글패치_v1.ips', format: 'ips', size: 64 });
    expect(update.$push.patches.objectKey).toMatch(/^retro-patches\/[0-9a-f-]{36}-/);
  });

  it('확장자가 아니라 내용으로 판별한다 — 이름만 .ips 인 파일은 거부', async () => {
    expect((await POST(request(form(patchFile('fake.ips', 'ZIPX'), ROM_ID)))).status).toBe(400);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it.each([['BPS1'], ['UPS1']])('%s 패치도 받는다', async (magic) => {
    expect((await POST(request(form(patchFile('p.bin', magic), ROM_ID)))).status).toBe(201);
  });

  it('한도를 넘으면 413', async () => {
    const big = patchFile('big.ips', 'PATCH', MAX_PATCH_BYTES + 1);
    expect((await POST(request(form(big, ROM_ID)))).status).toBe(413);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  it('응답에 오브젝트 키가 들어가지 않는다', async () => {
    const body = await (await POST(request(form(patchFile('ko.ips'), ROM_ID)))).json();
    expect(body.data.id).toBe(PATCH_ID);
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('기록이 실패하면 올린 오브젝트를 지운다', async () => {
    mockFindOneAndUpdate.mockReturnValue({ lean: () => Promise.reject(new Error('db down')) });
    expect((await POST(request(form(patchFile('ko.ips'), ROM_ID)))).status).toBe(500);
    expect(mockRemoveObject).toHaveBeenCalledTimes(1);
    expect(mockRemoveObject.mock.calls[0][1]).toBe(mockPutObject.mock.calls[0][1]);
  });
});

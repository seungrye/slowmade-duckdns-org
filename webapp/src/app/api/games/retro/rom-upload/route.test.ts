import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockPutObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRemoveObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockCreate = vi.hoisted(() => vi.fn());
// #190 — 같은 롬을 이미 올린 사람의 패치를 물려주는 경로.
const mockCopyObject = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFind = vi.hoisted(() => vi.fn());
const mockFindByIdAndUpdate = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.MINIO_ENDPOINT = 'test-endpoint.com';
  process.env.MINIO_ACCESSKEY = 'test-key';
  process.env.MINIO_SECRETKEY = 'test-secret';
  process.env.MINIO_BUCKET = 'test-bucket';
});

vi.mock('@/lib/achievements', () => ({ evaluateAndGrant: vi.fn().mockResolvedValue([]) }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock('minio', () => ({
  Client: class {
    putObject = mockPutObject;
    removeObject = mockRemoveObject;
    // #190 — 같은 롬을 올린 사람의 패치를 서버측 복사로 물려준다.
    copyObject = mockCopyObject;
  },
}));
vi.mock('@/models/retro-rom', () => ({
  default: { create: mockCreate, find: mockFind, findByIdAndUpdate: mockFindByIdAndUpdate },
}));

import { POST } from './route';
import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { MAX_ROM_BYTES } from '@/lib/retro/rom-upload';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

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
    mockPutObject.mockResolvedValue(undefined);
    mockCreate.mockImplementation((doc) => Promise.resolve({ ...doc, _id: 'newid', createdAt: new Date(0) }));
    // 기본은 "같은 롬을 올린 사람이 없다" — 물려줄 것이 없는 상태 (#190).
    mockFind.mockReturnValue({ select: () => ({ lean: async () => [] }) });
    mockFindByIdAndUpdate.mockReturnValue({ lean: async () => null });
    mockCopyObject.mockResolvedValue(undefined);
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
    form.set('platform', 'arcade');
    expect((await POST(request(form))).status).toBe(201);
    expect(mockCreate.mock.calls[0][0].platform).toBe('arcade');
  });

  it('한도를 넘으면 413 이고 저장하지 않는다', async () => {
    const form = new FormData();
    form.set('file', romFile('big.sfc', MAX_ROM_BYTES + 1));
    expect((await POST(request(form))).status).toBe(413);
    expect(mockPutObject).not.toHaveBeenCalled();
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

// #190 — 같은 롬을 이미 올린 사람의 패치를 물려준다.
//
// IPS 는 자체 체크섬이 없어 파일만으로는 대상 롬을 알 수 없다. 먼저 올린 사람이 **정확히 그
// 해시의 롬**에 붙였다는 사실이 호환성 근거다.
describe('POST /api/games/retro/rom-upload — 패치 물려받기 (#190)', () => {
  const sha = (c: string) => c.repeat(64);
  const otherRomWithPatch = (patches: Record<string, unknown>[]) => {
    mockFind.mockReturnValue({ select: () => ({ lean: async () => [{ patches }] }) });
  };
  const patch = (over: Record<string, unknown> = {}) => ({
    name: '한글패치.ips', format: 'ips', size: 500,
    objectKey: 'retro-patches/orig-한글패치.ips', sha256: sha('a'), ...over,
  });
  const upload = async () => {
    const form = new FormData();
    form.set('file', romFile('game.sfc'));
    form.set('title', 'Game');
    form.set('platform', 'snes');
    return POST(request(form));
  };

  // 이 describe 는 위 describe 밖이라 그쪽 beforeEach 를 받지 못한다 — 필요한 것을 직접 세운다.
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { email: 'me@test.com' } });
    mockPutObject.mockResolvedValue(undefined);
    mockCreate.mockImplementation((doc: Record<string, unknown>) =>
      Promise.resolve({ ...doc, _id: 'newid', createdAt: new Date(0) }));
    mockFind.mockReturnValue({ select: () => ({ lean: async () => [] }) });
    mockCopyObject.mockResolvedValue(undefined);
    mockFindByIdAndUpdate.mockReturnValue({
      lean: async () => ({ _id: 'newid', title: 'Game', platform: 'snes', size: 1024, createdAt: new Date(0), patches: [patch()] }),
    });
  });

  it('같은 롬에 붙은 패치를 복사해 물려준다', async () => {
    otherRomWithPatch([patch()]);
    expect((await upload()).status).toBe(201);
    expect(mockCopyObject).toHaveBeenCalledOnce();
    // 복사본은 이 사용자 것이다 — 원본 키를 그대로 쓰면 안 된다.
    const [, destKey, source] = mockCopyObject.mock.calls[0];
    expect(destKey).not.toBe('retro-patches/orig-한글패치.ips');
    expect(String(source)).toContain('retro-patches/orig-한글패치.ips');
    expect(mockFindByIdAndUpdate).toHaveBeenCalledOnce();
  });

  it('같은 롬을 올린 사람이 없으면 아무것도 하지 않는다', async () => {
    expect((await upload()).status).toBe(201);
    expect(mockCopyObject).not.toHaveBeenCalled();
  });

  // 한글판과 영문판 중 아무거나 고르면 원치 않은 언어로 게임이 바뀐다.
  it('서로 다른 패치가 섞여 있으면 물려주지 않는다', async () => {
    otherRomWithPatch([patch(), patch({ name: 'english.ips', sha256: sha('b') })]);
    expect((await upload()).status).toBe(201);
    expect(mockCopyObject).not.toHaveBeenCalled();
  });

  it('삭제된 패치는 물려주지 않는다', async () => {
    otherRomWithPatch([patch({ isDeleted: true })]);
    expect((await upload()).status).toBe(201);
    expect(mockCopyObject).not.toHaveBeenCalled();
  });

  // 편의 기능이 본 기능을 죽이면 안 된다.
  it('복사가 실패해도 업로드는 성공한다', async () => {
    otherRomWithPatch([patch()]);
    mockCopyObject.mockRejectedValue(new Error('MinIO down'));
    expect((await upload()).status).toBe(201);
  });

  it('DB 갱신이 실패해도 업로드는 성공한다', async () => {
    otherRomWithPatch([patch()]);
    mockFindByIdAndUpdate.mockImplementation(() => { throw new Error('db down'); });
    expect((await upload()).status).toBe(201);
  });

  it('내 롬은 후보가 아니다 — 남의 것에서만 물려받는다', async () => {
    await upload();
    const [query] = mockFind.mock.calls[0];
    expect(query.userEmail).toEqual({ $ne: 'me@test.com' });
    expect(query.isDeleted).toEqual({ $ne: true });
  });
});

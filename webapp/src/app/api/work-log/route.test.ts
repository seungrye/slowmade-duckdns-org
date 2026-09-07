// The work_log app distribution API (#261).
//
// The judgement (what to accept) is lib/work-log-release.test.ts's concern. This checks that **nothing happens
// without a key**, and that an upload is swapped in as the latest.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEnv = vi.hoisted(() => ({
  appKey: 'secret-key',
  siteUrl: 'https://site.test',
  minio: { bucket: 'bkt', endpoint: '', publicHost: '', accessKey: '', secretKey: '', port: undefined },
}));
vi.mock('@/lib/env', () => ({ env: mockEnv }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));

const mockPut = vi.hoisted(() => vi.fn());
const mockGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/minio-client', () => ({
  getMinioClient: () => ({ putObject: mockPut, getObject: mockGet }),
}));

const mockCreate = vi.hoisted(() => vi.fn());
const mockDeleteMany = vi.hoisted(() => vi.fn());
const mockFindOne = vi.hoisted(() => vi.fn());
vi.mock('@/models/work-log-release', () => ({
  default: { create: mockCreate, deleteMany: mockDeleteMany, findOne: mockFindOne },
}));

import { POST } from './release/route';
import { GET as LATEST } from './latest/route';

/** Mimics the mongoose chain down to lean(). */
function chain(result: unknown) {
  return { sort: () => ({ lean: async () => result }) };
}

function uploadReq(fields: Record<string, string>, apkBytes = 100, key = 'secret-key') {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('apk', new File([new Uint8Array(apkBytes)], 'app-release.apk'));
  return new Request('http://x/api/work-log/release', {
    method: 'POST', headers: { 'x-app-key': key }, body: form,
  }) as never;
}

describe('POST /api/work-log/release', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.appKey = 'secret-key';
    mockPut.mockResolvedValue({});
    mockCreate.mockResolvedValue({});
    mockDeleteMany.mockResolvedValue({});
  });

  it('키가 틀리면 401 — 아무것도 담지 않는다', async () => {
    const res = await POST(uploadReq({ versionCode: '2', versionName: '0.2' }, 100, 'wrong-key'));
    expect(res.status).toBe(401);
    expect(mockPut).not.toHaveBeenCalled();
  });

  // Left open with no key configured, anyone could swap the APK.
  it('APP_KEY 가 비어 있으면 503 — 열어 두지 않는다', async () => {
    mockEnv.appKey = '';
    const res = await POST(uploadReq({ versionCode: '2', versionName: '0.2' }));
    expect(res.status).toBe(503);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('versionCode 가 없으면 400', async () => {
    const res = await POST(uploadReq({ versionName: '0.2' }));
    expect(res.status).toBe(400);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('정상이면 MinIO 에 담고 기록을 남긴다', async () => {
    const res = await POST(uploadReq({ versionCode: '7', versionName: '0.7', notes: '고침' }, 1234));
    expect(res.status).toBe(200);
    expect(mockPut).toHaveBeenCalledTimes(1);
    const doc = mockCreate.mock.calls[0][0];
    expect(doc.versionCode).toBe(7);
    expect(doc.size).toBe(1234);
  });

  // Only one is kept - without deleting, old records pile up and which is latest gets murky.
  it('올릴 때 이전 기록을 지운다', async () => {
    await POST(uploadReq({ versionCode: '7', versionName: '0.7' }));
    expect(mockDeleteMany).toHaveBeenCalled();
  });
});

describe('GET /api/work-log/latest', () => {
  const req = (key = 'secret-key') =>
    new Request('http://x/api/work-log/latest', { headers: { 'x-app-key': key } }) as never;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.appKey = 'secret-key';
  });

  it('키가 틀리면 401', async () => {
    expect((await LATEST(req('wrong-key'))).status).toBe(401);
  });

  // There is no reason for the app to raise an error just because nothing has been uploaded yet.
  it('올라온 것이 없으면 오류가 아니라 available:false', async () => {
    mockFindOne.mockReturnValue(chain(null));
    const res = await LATEST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false });
  });

  it('최신 버전과 받을 주소를 준다', async () => {
    mockFindOne.mockReturnValue(chain({ versionCode: 9, versionName: '0.9', notes: 'n', size: 5 }));
    const body = await (await LATEST(req())).json();
    expect(body.versionCode).toBe(9);
    expect(body.apkUrl).toBe('https://site.test/api/work-log/apk');
  });
});

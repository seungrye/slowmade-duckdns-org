// 진단 올리기 라우트 (#409).
//
// **키가 없으면 아무 일도 일어나지 않는지**, 그리고 **최근 것을 남기고 오래된 것만 걷는지** 본다.
// 뒤엣것이 틀리면 방금 올린 자취가 그 자리에서 지워진다 — 제일 알고 싶은 것을 잃는다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEnv = vi.hoisted(() => ({ appKey: 'secret-key' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));

const mockCreate = vi.hoisted(() => vi.fn());
const mockDeleteMany = vi.hoisted(() => vi.fn());
const mockFind = vi.hoisted(() => vi.fn());
vi.mock('@/models/work-log-diag', () => ({
  default: { create: mockCreate, deleteMany: mockDeleteMany, find: mockFind },
}));

import { POST } from './diag/route';

function req(body: unknown, key?: string) {
  return new Request('https://site.test/api/work-log/diag', {
    method: 'POST',
    headers: key ? { 'x-app-key': key, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.appKey = 'secret-key';
  mockCreate.mockResolvedValue({ _id: 'id1' });
  mockFind.mockReturnValue({
    sort: () => ({ limit: () => ({ lean: () => Promise.resolve([{ _id: 'keep1' }, { _id: 'keep2' }]) }) }),
  });
  mockDeleteMany.mockResolvedValue({});
});

describe('POST /api/work-log/diag', () => {
  it('키가 없으면 401 — 아무것도 안 담는다', async () => {
    const res = await POST(req({ body: '스택' }));
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('키가 틀리면 401', async () => {
    const res = await POST(req({ body: '스택' }, 'wrong'));
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('서버에 키가 없으면 503 — 열어 두지 않는다', async () => {
    mockEnv.appKey = '';
    const res = await POST(req({ body: '스택' }, 'secret-key'));
    expect(res.status).toBe(503);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('글이 비면 400', async () => {
    const res = await POST(req({ body: '  ' }, 'secret-key'));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('제대로 올리면 담는다', async () => {
    const res = await POST(req({ versionCode: 30, versionName: '0.30', device: 'Pixel', kind: 'crash', body: '스택…' }, 'secret-key'));
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ versionCode: 30, kind: 'crash', body: '스택…' }),
    );
  });

  it('남길 것만 빼고 걷는다 — 방금 올린 것은 안 걷는다', async () => {
    await POST(req({ body: '스택' }, 'secret-key'));
    expect(mockDeleteMany).toHaveBeenCalledWith({ _id: { $nin: ['keep1', 'keep2'] } });
  });
});

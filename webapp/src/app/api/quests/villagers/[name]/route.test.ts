import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/villager', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

import { GET, PUT, DELETE } from './route';
import Villager from '@/models/villager';

function makeParams(name: string) {
  return Promise.resolve({ name });
}

function makeRequest(method: string, body?: object): NextRequest {
  return new Request(`http://localhost/api/villagers/x`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

describe('GET /api/villagers/[name]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('찾지 못하면 404', async () => {
    (Villager.findOne as ReturnType<typeof vi.fn>).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeRequest('GET'), { params: makeParams('없는이름') });
    expect(res.status).toBe(404);
  });

  it('decodeURIComponent 로 한글 name 처리', async () => {
    const mock = { name: '장로', color: [0.9, 0.8, 0.5] };
    (Villager.findOne as ReturnType<typeof vi.fn>).mockReturnValue({ lean: vi.fn().mockResolvedValue(mock) });
    const encoded = encodeURIComponent('장로');
    const res = await GET(makeRequest('GET'), { params: makeParams(encoded) });
    expect(res.status).toBe(200);
    expect(Villager.findOne).toHaveBeenCalledWith({ name: '장로' });
  });
});

describe('PUT /api/villagers/[name]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('찾지 못하면 404', async () => {
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(makeRequest('PUT', { speed: 2.0 }), { params: makeParams('x') });
    expect(res.status).toBe(404);
  });

  it('color 형식이 잘못되면 400 (저장 안 함)', async () => {
    const villager = { color: [0.5, 0.5, 0.5], save: vi.fn() };
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(villager);
    const res = await PUT(makeRequest('PUT', { color: [2, 0, 0] }), { params: makeParams('x') });
    expect(res.status).toBe(400);
    expect(villager.save).not.toHaveBeenCalled();
  });

  it('정의된 필드만 갱신, 그 외는 유지', async () => {
    const villager = {
      name: '장로', color: [0.9, 0.8, 0.5], dialogs: ['안녕'],
      questId: 'gem_quest', speed: 0.5,
      save: vi.fn().mockResolvedValue(undefined),
    };
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(villager);
    await PUT(makeRequest('PUT', { speed: 2.0 }), { params: makeParams('장로') });
    expect(villager.speed).toBe(2.0);
    expect(villager.color).toEqual([0.9, 0.8, 0.5]); // 변경 없음
    expect(villager.dialogs).toEqual(['안녕']); // 변경 없음
  });

  it('questId 를 null 로 명시하면 null 로 갱신', async () => {
    const villager = { questId: 'gem_quest', save: vi.fn().mockResolvedValue(undefined) };
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(villager);
    await PUT(makeRequest('PUT', { questId: null }), { params: makeParams('x') });
    expect(villager.questId).toBeNull();
  });
});

describe('DELETE /api/villagers/[name]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('찾지 못하면 404', async () => {
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE'), { params: makeParams('x') });
    expect(res.status).toBe(404);
  });

  it('존재하면 deleteOne 호출 후 200', async () => {
    const villager = { name: '장로', deleteOne: vi.fn().mockResolvedValue(undefined) };
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(villager);
    const res = await DELETE(makeRequest('DELETE'), { params: makeParams('장로') });
    expect(res.status).toBe(200);
    expect(villager.deleteOne).toHaveBeenCalled();
  });
});

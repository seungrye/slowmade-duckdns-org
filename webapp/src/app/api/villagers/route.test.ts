import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/villager', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

import { GET, POST } from './route';
import Villager from '@/models/villager';

function makeRequest(body?: object): NextRequest {
  return new Request('http://localhost/api/villagers', {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

describe('GET /api/villagers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('villager 목록을 name 오름차순으로 반환한다', async () => {
    const mockList = [{ name: '연금술사', color: [0.4, 0.9, 0.8] }, { name: '장로', color: [0.9, 0.8, 0.5] }];
    (Villager.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockList) }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(mockList);
  });
});

describe('POST /api/villagers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('name 누락 시 400', async () => {
    const res = await POST(makeRequest({ color: [0.5, 0.5, 0.5] }));
    expect(res.status).toBe(400);
  });

  it('color 형식이 [0~1, 0~1, 0~1] 이 아니면 400', async () => {
    const res1 = await POST(makeRequest({ name: '장로', color: [1.5, 0, 0] }));
    expect(res1.status).toBe(400);
    const res2 = await POST(makeRequest({ name: '장로', color: [0.5, 0.5] }));
    expect(res2.status).toBe(400);
    const res3 = await POST(makeRequest({ name: '장로', color: 'red' }));
    expect(res3.status).toBe(400);
  });

  it('name 이 이미 존재하면 409', async () => {
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({ name: '장로' });
    const res = await POST(makeRequest({ name: '장로', color: [0.9, 0.8, 0.5] }));
    expect(res.status).toBe(409);
  });

  it('기본값 (dialogs=[], questId=null, speed=1.0) 으로 생성', async () => {
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Villager.create as ReturnType<typeof vi.fn>).mockResolvedValue({ name: '촌장' });

    const res = await POST(makeRequest({ name: '촌장', color: [1.0, 0.85, 0.0] }));
    expect(res.status).toBe(201);
    expect(Villager.create).toHaveBeenCalledWith(expect.objectContaining({
      name: '촌장',
      color: [1.0, 0.85, 0.0],
      dialogs: [],
      questId: null,
      speed: 1.0,
    }));
  });

  it('명시된 dialogs / questId / speed 로 생성', async () => {
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Villager.create as ReturnType<typeof vi.fn>).mockResolvedValue({ name: '장로' });

    await POST(makeRequest({
      name: '장로',
      color: [0.9, 0.8, 0.5],
      dialogs: ['안녕'],
      questId: 'gem_quest',
      speed: 0.5,
    }));
    expect(Villager.create).toHaveBeenCalledWith(expect.objectContaining({
      dialogs: ['안녕'],
      questId: 'gem_quest',
      speed: 0.5,
    }));
  });
});

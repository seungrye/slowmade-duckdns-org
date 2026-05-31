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

  it('villager 목록을 id 오름차순으로 반환한다', async () => {
    const mockList = [{ id: 'alchemist', name: '연금술사', color: [0.4, 0.9, 0.8] }, { id: 'elder', name: '장로', color: [0.9, 0.8, 0.5] }];
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

  it('id 누락 시 400', async () => {
    const res = await POST(makeRequest({ name: '장로', color: [0.5, 0.5, 0.5] }));
    expect(res.status).toBe(400);
  });

  it('name 누락 시 400', async () => {
    const res = await POST(makeRequest({ id: 'elder', color: [0.5, 0.5, 0.5] }));
    expect(res.status).toBe(400);
  });

  it('color 형식이 [0~1, 0~1, 0~1] 이 아니면 400', async () => {
    const res1 = await POST(makeRequest({ id: 'elder', name: '장로', color: [1.5, 0, 0] }));
    expect(res1.status).toBe(400);
    const res2 = await POST(makeRequest({ id: 'elder', name: '장로', color: [0.5, 0.5] }));
    expect(res2.status).toBe(400);
    const res3 = await POST(makeRequest({ id: 'elder', name: '장로', color: 'red' }));
    expect(res3.status).toBe(400);
  });

  it('id 가 이미 존재하면 409', async () => {
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'elder' });
    const res = await POST(makeRequest({ id: 'elder', name: '장로', color: [0.9, 0.8, 0.5] }));
    expect(res.status).toBe(409);
  });

  it('기본값 (dialogs=[], speed=1.0) 으로 생성', async () => {
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Villager.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'burgomaster' });

    const res = await POST(makeRequest({ id: 'burgomaster', name: '촌장', color: [1.0, 0.85, 0.0] }));
    expect(res.status).toBe(201);
    expect(Villager.create).toHaveBeenCalledWith(expect.objectContaining({
      id: 'burgomaster',
      name: '촌장',
      color: [1.0, 0.85, 0.0],
      dialogs: [],
      speed: 1.0,
    }));
  });

  it('명시된 dialogs / speed 로 생성', async () => {
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Villager.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'elder' });

    await POST(makeRequest({
      id: 'elder',
      name: '장로',
      color: [0.9, 0.8, 0.5],
      dialogs: ['안녕'],
      speed: 0.5,
    }));
    expect(Villager.create).toHaveBeenCalledWith(expect.objectContaining({
      id: 'elder',
      dialogs: ['안녕'],
      speed: 0.5,
    }));
  });

  it('homeLandmark 가 enum 외 값이면 400', async () => {
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await POST(makeRequest({
      id: 'x', name: 'x', color: [0.5, 0.5, 0.5], homeLandmark: 'castle',
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/homeLandmark/);
  });

  it('homeLandmark 가 enum 값이면 그대로 전달', async () => {
    (Villager.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Villager.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'innkeeper' });
    await POST(makeRequest({
      id: 'innkeeper', name: '여관 주인', color: [0.5, 0.5, 0.5], homeLandmark: 'inn',
    }));
    expect(Villager.create).toHaveBeenCalledWith(expect.objectContaining({
      homeLandmark: 'inn',
    }));
  });
});

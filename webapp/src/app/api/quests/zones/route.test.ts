import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/zone', () => ({
  default: { find: vi.fn(), findOne: vi.fn(), create: vi.fn() },
}));

import { GET, POST } from './route';
import Zone from '@/models/zone';

function makeRequest(body?: object): NextRequest {
  return new Request('http://localhost/api/quests/zones', {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

describe('GET /api/quests/zones', () => {
  beforeEach(() => vi.clearAllMocks());

  it('zone 목록을 name 오름차순으로 반환', async () => {
    const list = [{ name: 'demon_cave', generator: 'cellular_automata' }];
    (Zone.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(list) }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(list);
  });
});

describe('POST /api/quests/zones', () => {
  beforeEach(() => vi.clearAllMocks());

  it('name 누락 시 400', async () => {
    const res = await POST(makeRequest({ generator: 'bsp' }));
    expect(res.status).toBe(400);
  });

  it('generator 누락 시 400', async () => {
    const res = await POST(makeRequest({ name: 'demon_cave' }));
    expect(res.status).toBe(400);
  });

  it('name 중복 시 409', async () => {
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({ name: 'demon_cave' });
    const res = await POST(makeRequest({ name: 'demon_cave', generator: 'cellular_automata' }));
    expect(res.status).toBe(409);
  });

  it('생성 시 description 기본 빈 문자열', async () => {
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Zone.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    await POST(makeRequest({ name: 'demon_cave', generator: 'cellular_automata' }));
    expect(Zone.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'demon_cave', generator: 'cellular_automata', description: '',
    }));
  });

  it('description 명시 시 그대로 저장', async () => {
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Zone.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    await POST(makeRequest({
      name: 'herb_glade', generator: 'forest', description: '약초 채집장',
    }));
    expect(Zone.create).toHaveBeenCalledWith(expect.objectContaining({
      description: '약초 채집장',
    }));
  });
});

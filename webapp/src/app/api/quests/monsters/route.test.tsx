import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/monster', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

import { GET, POST } from './route';
import Monster from '@/models/monster';

function makeRequest(body?: object): NextRequest {
  return new Request('http://localhost/api/quests/monsters', {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

const VALID = {
  id: 'goblin',
  displayName: '고블린',
  glyph: 'g',
  color: [0.2, 0.8, 0.2],
  hp: 6,
  attack: 3,
  defense: 0,
  visionRadius: 6,
  speed: 1.5,
  element: 'poison',
};

describe('GET /api/quests/monsters', () => {
  beforeEach(() => vi.clearAllMocks());

  it('monster 목록을 id 오름차순으로 반환한다', async () => {
    const mockList = [{ id: 'goblin', displayName: '고블린' }, { id: 'orc', displayName: '오크' }];
    (Monster.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockList) }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(mockList);
  });
});

describe('POST /api/quests/monsters', () => {
  beforeEach(() => vi.clearAllMocks());

  it('id 누락 시 400', async () => {
    const res = await POST(makeRequest({ ...VALID, id: '' }));
    expect(res.status).toBe(400);
  });

  it('displayName 누락 시 400', async () => {
    const res = await POST(makeRequest({ ...VALID, displayName: '' }));
    expect(res.status).toBe(400);
  });

  it('glyph 누락 시 400', async () => {
    const res = await POST(makeRequest({ ...VALID, glyph: '' }));
    expect(res.status).toBe(400);
  });

  it('color 형식이 [0~1, 0~1, 0~1] 이 아니면 400', async () => {
    expect((await POST(makeRequest({ ...VALID, color: [1.5, 0, 0] }))).status).toBe(400);
    expect((await POST(makeRequest({ ...VALID, color: [0.5, 0.5] }))).status).toBe(400);
    expect((await POST(makeRequest({ ...VALID, color: 'red' }))).status).toBe(400);
  });

  it('알 수 없는 element 면 400', async () => {
    const res = await POST(makeRequest({ ...VALID, element: 'holy' }));
    expect(res.status).toBe(400);
  });

  it('이미 존재하는 id 면 409', async () => {
    (Monster.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'goblin' });
    const res = await POST(makeRequest(VALID));
    expect(res.status).toBe(409);
  });

  it('유효한 입력이면 201 로 생성한다 (기본값 채움)', async () => {
    (Monster.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Monster.create as ReturnType<typeof vi.fn>).mockImplementation(async (doc) => doc);
    const res = await POST(makeRequest({ id: 'slime', displayName: '슬라임', glyph: 's', color: [0, 0.5, 0] }));
    expect(res.status).toBe(201);
    const arg = (Monster.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.spawnWeight).toBe(1.0);
    expect(arg.element).toBe(null);
    expect(arg.questOnly).toBe(false);
    expect(arg.zones).toEqual([]);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/quest', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
  }
}));

import { GET, POST } from './route';
import Quest from '@/models/quest';

function makeRequest(body?: object) {
  return new Request('http://localhost/api/quests', {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('GET /api/quests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('퀘스트 목록을 반환한다', async () => {
    const mockQuests = [{ id: 'q1', title: '퀘스트1', version: 1 }];
    (Quest.find as ReturnType<typeof vi.fn>).mockReturnValue({
      sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockQuests) }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(mockQuests);
  });
});

describe('POST /api/quests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('id나 title이 없으면 400을 반환한다', async () => {
    const res = await POST(makeRequest({ title: '제목만' }) as any);
    expect(res.status).toBe(400);
  });

  it('이미 존재하는 id면 409를 반환한다', async () => {
    (Quest.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'existing' });
    const res = await POST(makeRequest({ id: 'existing', title: '제목' }) as any);
    expect(res.status).toBe(409);
  });

  it('giverNpc 없이도 퀘스트를 생성한다', async () => {
    (Quest.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const created = { id: 'new_quest', title: '새 퀘스트', giverNpc: '', version: 1 };
    (Quest.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    const res = await POST(makeRequest({ id: 'new_quest', title: '새 퀘스트' }) as any);
    expect(res.status).toBe(201);
    expect(Quest.create).toHaveBeenCalledWith(expect.objectContaining({ giverNpc: '' }));
  });

  it('giverNpc 포함해서도 퀘스트를 생성한다', async () => {
    (Quest.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Quest.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'q1', title: 'T', giverNpc: 'npc1' });

    const res = await POST(makeRequest({ id: 'q1', title: 'T', giverNpc: 'npc1' }) as any);
    expect(res.status).toBe(201);
    expect(Quest.create).toHaveBeenCalledWith(expect.objectContaining({ giverNpc: 'npc1' }));
  });
});

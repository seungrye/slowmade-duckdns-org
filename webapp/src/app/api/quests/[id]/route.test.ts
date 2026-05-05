import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/quest', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/models/quest-revision', () => ({ default: { create: vi.fn() } }));

import { GET, PUT } from './route';
import Quest from '@/models/quest';
import QuestRevision from '@/models/quest-revision';

const params = Promise.resolve({ id: 'test-id' });

function makeRequest(method: string, body?: object) {
  return new Request(`http://localhost/api/quests/test-id`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('GET /api/quests/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('퀘스트를 찾지 못하면 404를 반환한다', async () => {
    (Quest.findById as ReturnType<typeof vi.fn>).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeRequest('GET') as any, { params });
    expect(res.status).toBe(404);
  });

  it('lean() plain object phases를 그대로 반환한다', async () => {
    // lean() returns plain objects, not Map instances
    (Quest.findById as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        id: 'q1', title: '퀘스트', giverNpc: '', initialPhase: 'dormant',
        phases: { dormant: { dialog: ['안녕'], on_interact: [], auto_advance: [], objective: null } },
        spawns: [], version: 1,
      }),
    });
    const res = await GET(makeRequest('GET') as any, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.phases).toHaveProperty('dormant');
    expect(body.data.phases.dormant.dialog).toEqual(['안녕']);
  });

  it('lean() Map 인스턴스 phases도 처리한다', async () => {
    (Quest.findById as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        id: 'q1', title: '퀘스트', giverNpc: '', initialPhase: 'dormant',
        phases: new Map([['dormant', { dialog: [], on_interact: [], auto_advance: [], objective: null }]]),
        spawns: [], version: 1,
      }),
    });
    const res = await GET(makeRequest('GET') as any, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.phases).toHaveProperty('dormant');
  });
});

describe('PUT /api/quests/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('퀘스트를 찾지 못하면 404를 반환한다', async () => {
    (Quest.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(makeRequest('PUT', { title: '새 제목' }) as any, { params });
    expect(res.status).toBe(404);
  });

  it('title을 업데이트하고 revision을 생성한다', async () => {
    const mockPhases = new Map([['dormant', { dialog: [] }]]);
    const mockQuest = {
      _id: 'mongo-id', id: 'q1', title: '기존 제목', giverNpc: '',
      initialPhase: 'dormant', phases: mockPhases, spawns: [], version: 1,
      save: vi.fn().mockResolvedValue(undefined),
      toObject: vi.fn().mockReturnValue({ id: 'q1', title: '새 제목', giverNpc: '', initialPhase: 'dormant', spawns: [], version: 2 }),
    };
    (Quest.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockQuest);
    (QuestRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await PUT(makeRequest('PUT', { title: '새 제목' }) as any, { params });
    expect(res.status).toBe(200);
    expect(mockQuest.title).toBe('새 제목');
    expect(mockQuest.version).toBe(2);
    expect(QuestRevision.create).toHaveBeenCalledWith(expect.objectContaining({ questId: 'mongo-id', version: 1 }));
  });

  it('body.phases를 Map으로 변환해서 저장한다', async () => {
    const mockPhases = new Map([['dormant', { dialog: [] }]]);
    const mockQuest = {
      _id: 'mongo-id', id: 'q1', title: 'T', giverNpc: '',
      initialPhase: 'dormant', phases: mockPhases, spawns: [], version: 1,
      save: vi.fn().mockResolvedValue(undefined),
      toObject: vi.fn().mockReturnValue({ id: 'q1', title: 'T', spawns: [], version: 2 }),
    };
    (Quest.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockQuest);
    (QuestRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const newPhases = { active: { dialog: ['반응'], on_interact: [], auto_advance: [], objective: null } };
    await PUT(makeRequest('PUT', { phases: newPhases }) as any, { params });

    expect(mockQuest.phases).toBeInstanceOf(Map);
    expect(mockQuest.phases.get('active')).toEqual(newPhases.active);
  });
});
